# R2 配置指南（一份文档配齐所有环节）

> 本文集中回答"我要改哪个文件、填什么值"。架构与 API 详情见 `README-R2.md`，控制台操作细节见 `functions/R2-SETUP.md`。
>
> 配置分三层，谁在哪台机器上配，互不交叉：

| 层 | 配置文件 | 配在哪 | 谁需要动 | 管什么 |
|---|---|---|---|---|
| ① 服务端 | `functions/.env` | Firebase 项目 | 你（一次性） | R2 密钥、鉴权 token |
| ② CI 上传端 | `jj.config.json` | 打包机/开发者目录 | 你（按项目灰度） | 哪个项目/环境走 R2 |
| ③ Cloudflare | 控制台 | Cloudflare 账号 | 管理员（一次性） | bucket、API 密钥、CORS |

---

## 一、服务端：`functions/.env`（一次性）

```bash
cd functions
cp .env.example .env     # .env 会被部署上线；.env.local 仅本地且优先级更高
```

| 变量 | 必填 | 说明 | 哪里拿 |
|---|---|---|---|
| `R2_ACCOUNT_ID` | ✅ | Cloudflare 账户 ID | 控制台 R2 概览页右侧 |
| `R2_ACCESS_KEY_ID` | ✅ | S3 兼容 Access Key | R2 → Manage R2 API Tokens |
| `R2_SECRET_ACCESS_KEY` | ✅ | S3 兼容 Secret（只显示一次） | 同上，创建时立刻复制 |
| `R2_BUCKET` | ✅ | bucket 名称（如 `aigens-app-builds`） | 你创建时定的 |
| `R2_API_TOKEN` | ✅ | 我们自己接口的调用密钥（与 Cloudflare 无关） | 自己生成：`openssl rand -hex 32` |
| `R2_PUBLIC_BASE_URL` | ❌ | 自定义域名模式（如 `https://dl.xxx.com`），填了下载链接变永久公开链接 | 管理员绑域名后填 |

```bash
npm run deploy           # 改完必须重新部署才生效
curl .../appdownload/r2/health   # 验证 r2Configured:true + apiTokenConfigured:true
```

> 安全：`.env*` 已在 `functions/.gitignore`，绝不提交；`R2_API_TOKEN` 会同时发给 jj-cli 侧（第②层）。

## 二、CI 上传端：`jj.config.json`（按项目灰度）

### 2.1 配置文件在哪（jj-cli 的查找顺序）

`j upload` 按以下顺序找 `jj.config.json`，**用找到的第一个**：

1. 命令行 `-fp/--folderpath` 指定的目录里的 `jj.config.json`
2. 当前执行目录（CI 的打包目录）下的 `jj.config.json`
3. 系统默认路径：Mac `/Users/chenpeijue/Desktop/Android-sign/jj.config.json`；Windows `C:\Users\aigens-pc\Desktop\Android-sign\jj.config.json`
4. 都没有 → 兜底拉取**远端 deviceConfig**（`aigensstoretest.aigens.com/.../config.json`）

> 实践建议：灰度期改 **2 或 3** 的本地文件（最快、可单机验证）；全量迁移后再考虑把 r2 段同步进远端 deviceConfig。

### 2.2 每个项目加 `r2` 段（极简）

```jsonc
{
  "name": "ichiran",
  "r2": { "envs": ["uat"] },          // ← 灰度：只有 uat 走 R2
  // "r2": { "envs": [] },            // ← 全量：该项目所有环境走 R2
  // （关闭 = 删掉 r2 段；endpoint 已内置默认，token 走安全链，都不用写）

  // 可选：前端展示配置（buildPassword 密码门控），按 platform/env 放，
  // 与 envs 同段共存。前端读取：r2 段优先，pgyer 段兜底（迁移期无需重复配置）
  // 注意：channel 仅 pgyer 段需要（旧版本重试链接），R2 段不用配
  "r2": {
    "envs": ["uat"],
    "ios": { "uat": { "buildPassword": "0123" } }
  },

  "pgyer": { "...": "保持不动" },
  "appcenter": { "...": "保持不动" }
}
```

### 2.3 `r2` 段字段速查（尽可能少）

| 字段 | 需要 | 说明 |
|---|---|---|
| `envs` | ✅ 唯一核心 | 环境白名单。`["uat"]` 灰度；`[]` 全量。支持 `v4uat`/`phase2uat` 别名自动归一化 |
| `buildPassword` | ❌ 可选 | 密码规则：env 级显式值 > r2 段 app 级值 > **默认 "0123"**；显式设为空串 "" 表示该环境免密码。不必每个 env 都写 |
| `ios` / `android` | ❌ 可选 | 前端展示配置（`buildPassword`/`channel` 等），结构同 pgyer 段的 platform/env；**r2 段优先、pgyer 段兜底** |
| `endpoint` | ❌ | 已内置默认值，仅当后端迁移时才需要覆盖 |
| `enabled` | ❌ | 段存在即启用；想关闭直接删段（更简单） |
| ~~`token`~~ | ❌ | **已废弃并忽略**（安全链见 2.3.1） |


```json

"r2": { "envs": [] }
// 密码不用写了——默认就是 "0123"

// 只有"例外"才需要写：
"r2": {
  "envs": [],
  "buildPassword": "9999",                      // 整个 app 换密码
  "ios": { "uat": { "buildPassword": "" } }     // 只有 iOS uat 免密码
}


```



### 2.3.1 token 怎么给（安全链，优先级从高到低）

```bash
# 方式①：命令行临时传（最高优先级）
j upload android -path "..." -pn "项目" -appcenter uat -r2token=<R2_API_TOKEN>

# 方式②：环境变量（CI 推荐，放进 CI 的 secret/env 配置）
export JJ_R2_TOKEN=<R2_API_TOKEN>

# 方式③：本机私有文件（日常本机使用，一次配置长期有效）
mkdir -p ~/.jj-cli
cat > ~/.jj-cli/r2.json <<EOF
{ "token": "<R2_API_TOKEN>" }
EOF
chmod 600 ~/.jj-cli/r2.json
```

> 安全边界：token **只**存在于上述三处——命令行（临时）、CI secret、你本机私有文件。jj.config.json 和远端 deviceConfig 里**永远不要放 token**（endpoint/enabled/envs 可以放）。即使 r2 段被同步到公开的远端配置，也没有 token 可泄，R2 功能不会被陌生 npm 用户触发。

### 2.4 分流规则（无需记，行为如下）

- `r2` 段不存在 / `enabled:false` / 缺 `endpoint`/`token` → **pgyer**（行为与现在完全一致）
- `envs` 非空且当前环境在列表内 → **R2**；不在列表内 → **pgyer**
- `j upload`、`j payer-nextversion` 两个命令都按同一规则分流，**命令行参数零变化**

## 二A、上传 Cliq 通知（成功 + 失败，服务端统一发）

### 获取 Webhook URL（Zoho Cliq 官方步骤）

1. 打开 Zoho Cliq → 左下角头像旁 → **Bots & Tools**（不是频道设置）
2. 进入 **Webhook Tokens** 模块（需通过 2FA 双因素验证，会话 15 分钟有效）
3. 点击 **Generate New Token**（每用户最多 5 个 token；生成后可重命名/启停/查看调用历史）
4. 点击该 token → **Get Webhook URL** → 选择 **Channels** → 选目标频道 → 复制完整 URL
   （形如 `https://cliq.zoho.com/api/v2/channelsbyname/{频道名}/message?zapikey={token}`）
5. 验证（频道收到 test 即 OK）：curl -X POST URL -H Content-Type:application/json -d 请求体 {"text":"test"}

### 配置（两个位置，职责不同）

**① functions 服务端（主通道：所有上传的成功 + commit 失败通知）**

```bash
# functions/.env（部署生效；覆盖 jj-cli / console / 任何 API 上传）
R2_CLIQ_WEBHOOK=https://cliq.zoho.com/api/v2/channelsbyname/xxx/message?zapikey=yyy
```

**② jj-cli 客户端（补充通道：仅"commit 之前"的失败——版本解析 / upload-url / PUT 直传失败）**

```bash
# 环境变量（CI）或 ~/.jj-cli/r2.json（本机，与 token 同文件）：
{ "token": "<R2_API_TOKEN>", "cliqWebhook": "https://cliq.zoho.com/..." }
```

### 通知矩阵（谁发什么，无重复）

| 场景 | 通知方 | 消息示例 |
|---|---|---|
| 上传成功（任何途径） | functions | 📦 cosmo — new build uploaded（版本/大小/下载链接） |
| commit 失败（文件缺失/参数错/meta 冲突） | functions | ❌ cosmo upload FAILED (android/uat v1.0) + 原因 |
| 版本解析失败（jj-cli） | jj-cli | ❌ cosmo upload FAILED at version-parsing + 原因 |
| upload-url / PUT 直传失败（jj-cli） | jj-cli | ❌ cosmo upload FAILED at upload + 原因 |
| console 手动上传失败 | 无通知（操作者当场看到 alert） | — |

失败不影响主流程：通知失败只打警告，上传结果不受影响。

## 三、Cloudflare 控制台（管理员一次性）

完整步骤见 `functions/R2-SETUP.md` 第二节，速记：建私有 bucket → 建 Object Read & Write 且**仅限该 bucket** 的 API Token（拿 Access Key/Secret）→ 记 Account ID → 配 bucket CORS（`AllowedOrigins` 填 `https://pgyer-enhance.web.app` 和 `http://localhost:4200`）。

## 三A、在哪里查看构建元数据（meta.json）

元数据与安装包同目录存放（R2 对象 `apps/{appId}/{platform}/{env}/{buildKey}/meta.json`），不依赖任何数据库。

1. **R2 控制台（线上）**：Cloudflare 控制台 → R2 → bucket → 按 `apps/应用名/...` 浏览，点开 meta.json 即可查看/下载
2. **命令行**：`node functions/list-apps.js`（扫 bucket，列 App/构建数/最新版本）或 `--api` 模式（部署后走 /r2/apps）
3. **本地 emulator**：本地测试数据同样落在真实 R2 bucket，用上面任一方式查看

## 四、安全模型（谁拿什么、接口怎么防）

**凭证分布**（互相独立，泄露面最小化）：

| 凭证 | 存放 | 绝不出现 |
|---|---|---|
| R2 Access Key/Secret | 仅 functions `.env` | 前端、jj-cli、git |
| `R2_API_TOKEN` | functions `.env` + jj.config.json | 命令行、前端、git |
| 下载链接 | 7 天签名 URL 动态生成 | 无永久公开链接（除非配自定义域名） |

**接口鉴权**（对除 `/r2/health` 外的所有 `/r2/*` 接口统一生效，满足任一即通过；`/health` 为公开排障端点，仅返回配置状态布尔值，不泄露任何密钥）：

| 调用方 | 通过方式 |
|---|---|
| 前端页面（pgyer-enhance.web.app） | 浏览器自动带 `Origin` 白名单匹配 |
| CI / jj-cli / 运维脚本 | 请求头 `x-api-key: <R2_API_TOKEN>` |
| 本地 emulators | `NODE_ENV=development` 自动放行 |
| 其他人（知道 URL 也不行） | ❌ 拒绝（旧版仅靠可伪造的 Referer，现已替换） |

apk/ipa 文件本身的下载走 R2 签名直链（不经过 functions），链接含随机 buildKey 不可猜测 + 7 天自动过期。

## 五、部署与灰度验证清单

按顺序执行，每步都有明确预期：

```bash
# 1. 服务端部署 + 自检
cd functions && cp .env.example .env && vi .env       # 填 5 项
npm install && npm run deploy
curl $BASE/r2/health          # 期望 {"ok":true,"r2Configured":true,"apiTokenConfigured":true,...}

# 2. 冒烟：三步上传一个测试包（详见 R2-SETUP.md 第 4-5 步）
#    期望：commit 返回 buildKey；merged-versions 能查到；download-url 能下载

# 3. jj-cli 灰度（先挑 1 个不重要的项目）
#    在它的 jj.config.json 加 r2 段（envs:["uat"]），然后照常:
j upload android -path "./app/build/outputs/..." -pn "项目名" -appcenter "uat" -closedfolder true
#    期望日志: Upload To "R2" ... version: x.x.x, icon: yes ... Upload Successful
#    （如果仍显示 Upload To "pgy" → 检查 r2 段是否被正确找到、envs 是否匹配）

# 4. 前端验证
#    打开 https://pgyer-enhance.web.app/app/项目名?env=uat&platform=android
#    期望：新 R2 版本带橙色 R2 徽章排在最上，旧 pgyer 版本正常在下面；
#         R2 版本 Install/DownloadIpa/删除/编辑描述全部可用
```

## 六、常见配置错误速查

| 症状 | 原因 | 解法 |
|---|---|---|
| 日志仍 `Upload To "pgy"` | r2 段没被找到（查 2.1 查找顺序）或 envs 不匹配 | 校对文件位置；envs 写归一化后的值（uat/prd） |
| 401 invalid api key | jj.config.json 的 token ≠ functions 的 R2_API_TOKEN | 两边对齐 |
| 503 R2_API_TOKEN not configured | 服务端 .env 没填或没重新 deploy | 填好后 `npm run deploy` |
| health 里 r2Configured:false | 4 个 R2_ 变量有漏 | 核对 .env |
| 前端 merged-versions 报错/401 | Origin 不在白名单（自定义域名场景） | r2.js 的 WEB_ORIGINS 加上域名并部署 |
| PUT 上传 403 SignatureDoesNotMatch | PUT 的 Content-Type 与 upload-url 返回的不一致 | 用返回的 headers["Content-Type"] |
| version: 解析失败（jj-cli） | apk 无 output-metadata.json 且文件名无版本号 | 保证 AGP 产出 output-metadata.json，或文件名带 x.y.z |
