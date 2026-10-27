# R2 接通操作清单（拿到 Key 后照此执行）

> 前置条件：已从 Cloudflare 管理员处拿到 4 样东西
> ① `Account ID` ② `Access Key ID` ③ `Secret Access Key` ④ `Bucket` 名称（管理员已配好 CORS 更佳）。
> 完整文档见项目根目录 `README-R2.md`。

## 第 1 步：配置环境变量（约 1 分钟）

```bash
cd functions
cp .env.example .env
```

编辑 `.env`：

```ini
R2_ACCOUNT_ID=xxx          # 管理员给的 Account ID
R2_ACCESS_KEY_ID=xxx       # 管理员给的 Access Key ID
R2_SECRET_ACCESS_KEY=xxx   # 管理员给的 Secret Access Key
R2_BUCKET=aigens-app-builds
R2_API_TOKEN=xxx           # 自己生成，见下方命令
```

`R2_API_TOKEN` 是我们接口自己的调用密钥（与 Cloudflare 无关），生成方式：

```bash
openssl rand -hex 32
```

> 注意：`.env` 已被 gitignore，不会提交到仓库。

## 第 2 步：部署

```bash
# 首次需要安装依赖（新增了 AWS SDK）
npm install

npm run deploy    # = firebase deploy --only functions
```

## 第 3 步：验证配置生效

```bash
curl https://us-central1-aigensstoretest.cloudfunctions.net/appdownload/r2/health
```

期望返回：

```json
{"ok":true,"r2Configured":true,"apiTokenConfigured":true,"publicMode":false,"bucket":"aigens-app-builds"}
```

- `r2Configured: false` → `.env` 四个 R2 配置有漏填/没部署上
- `apiTokenConfigured: false` → 没填 `R2_API_TOKEN`

## 第 4 步：跑通一次完整上传（用小文件测试）

以下把 `BASE` 和 `TOKEN` 换成实际值：

```bash
BASE=https://us-central1-aigensstoretest.cloudfunctions.net/appdownload
TOKEN=<你的R2_API_TOKEN>
```

### ① 要上传许可（返回 uploadUrl 和 buildKey）

```bash
curl -X POST $BASE/r2/upload-url \
  -H "x-api-key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"appId":"testapp","platform":"android","version":"1.0.0","fileName":"test.apk","env":"prd"}'
```

### ② 直传文件到 R2（Content-Type 必须用 ① 返回的 headers 里那个）

```bash
curl -X PUT "<①返回的uploadUrl>" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @test.apk
```

### ③ 登记构建元数据

```bash
curl -X POST $BASE/r2/commit-build \
  -H "x-api-key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"buildKey":"<①返回的buildKey>","appId":"testapp","platform":"android","version":"1.0.0","fileName":"test.apk","env":"prd"}'
```

## 第 5 步：验证下载

```bash
# 版本列表（能查到刚才的记录 = 元数据链路通）
curl "$BASE/r2/versions?appId=testapp&platform=android"

# 下载链接（返回的 url 贴浏览器能下载 = 存储链路通）
curl "$BASE/r2/download-url?key=<versions返回的key字段>"
```

四步全绿 = 接通完成 ✅。之后才是 jj-cli 改造与前端切换。

## 常见报错对照

| 现象 | 原因 | 处理 |
|---|---|---|
| ② 返回 403 SignatureDoesNotMatch | PUT 的 Content-Type 与 ① 返回的不一致 | 用 ① 返回的 `headers["Content-Type"]` |
| ① 返回 401 invalid api key | `x-api-key` 缺失或错误 | 核对 `R2_API_TOKEN`，改后需重新 deploy |
| ① 返回 503 | 服务端没配 `R2_API_TOKEN` | 填 `.env` 后重新 deploy |
| ③ 返回 file not found in R2 | ② 没传成功就调了 ③ | 先完成 ②，检查 PUT 返回码是否 200 |
| health 里 r2Configured:false | `.env` 没填全 | 核对 4 个 R2_ 变量，重新 deploy |
| 浏览器直传报 CORS 错 | bucket CORS 没配 | 让管理员按 README-R2.md 第二节配置 |

## 关于自定义域名（可选，不是必须）

当前默认使用**预签名 URL 模式**，不需要 R2 绑定自己的域名，接通和日常分发完全可用。

两种模式对比：

| | 预签名模式（默认） | 自定义域名模式 |
|---|---|---|
| 是否需要域名 | 不需要 | 需要托管在同一 Cloudflare 账号的域名 |
| 下载链接 | 7 天有效（到期重新生成） | 永久有效 |
| iOS 扫码二维码 | 会过期（7 天），过期后前端重新调接口刷新 | 永久有效 |
| 安全性 | 链接自动失效，更可控 | 依赖不可猜测的 key 路径 |
| 切换方式 | 不用配置 | `.env` 加一行 `R2_PUBLIC_BASE_URL=https://dl.xxx.com` 再 deploy |

**建议**：先用预签名模式接通上线；若后续出现 iOS 安装兼容问题、或需要"二维码永久有效"（打印物料、长期发群），再让管理员给 bucket 绑个子域名（如 `dl.公司域名.com`），在 `.env` 加 `R2_PUBLIC_BASE_URL` 重新部署即可，**代码无需任何改动**。
