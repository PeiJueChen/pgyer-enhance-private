# R2 上传/分发模块使用说明（中文）

本项目在现有 Firebase Cloud Functions（`functions/`）基础上新增了 **Cloudflare R2** 支持，用于替代蒲公英（pgyer）的 App 包存储与分发，彻底摆脱 20G 免费存储上限。

- 存储无上限：按量付费约 **$1.5/月/100G**（10G 内免费）
- **下载流量永久免费**（海外用户下载走 Cloudflare 全球 CDN）
- apk/ipa 通过**预签名 URL 前端直传/直下**，文件不经过 Cloud Functions（gen1 请求体上限只有 10MB，中转不可行，也因此流量零费用）

---

## 一、整体架构

```
Angular 前端 (Firebase Hosting: pgyer-enhance.web.app) / CI 脚本
   │ ① POST /r2/upload-url ──────→ Cloud Functions (appdownload)
   │      返回 30 分钟有效的预签名 PUT URL          │
   │ ② 浏览器/CI 用 PUT 直传文件到 R2（不经 Functions）
   ├────────────────────────────────→ Cloudflare R2 (apk / ipa / plist / icon)
   │ ③ POST /r2/commit-build ────→ Cloud Functions 验证文件存在 → 写 Firestore 元数据
   │
   │ ④ GET /r2/versions ────────→ 读 Firestore（替代 pgyer 的 builds 接口）
   │ ⑤ GET /r2/download-url ────→ 返回 7 天有效预签名下载 URL
   │ ⑥ GET /r2/install-plist ───→ 动态生成 iOS OTA manifest.plist 并上传 R2，
   │                                 返回 itms-services:// 安装链接（用于二维码）
   └──────────────────────────────→ 海外用户从 R2 CDN 直接下载（零流量费）
```

## 二、Cloudflare 控制台准备（一次性）

1. **创建 Bucket**
   - 控制台 → Storage & Databases → R2 Object Storage → Create bucket
   - 名称：小写字母/数字/连字符，3~63 字符（例如 `aigens-app-builds`）
   - 保持**私有**，不要开启 r2.dev 公共访问
2. **创建 R2 API 凭证（S3 兼容密钥）**
   - R2 概览页右侧 → Manage R2 API Tokens → Create Account API token
   - 权限：**Object Read & Write**
   - 作用范围：**Apply to specific buckets only**，只选上面建的 bucket（最小权限）
   - 创建后**立刻复制** `Access Key ID` 和 `Secret Access Key`（Secret 只显示一次）
3. **记录 Account ID**：R2 概览页右侧可见（S3 Endpoint 就是 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`）
4. **配置 Bucket CORS**（前端浏览器直传必须）——bucket → Settings → CORS policy，粘贴：

   ```json
   [
     {
       "AllowedOrigins": ["https://pgyer-enhance.web.app", "http://localhost:4200"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

5. （可选，生产推荐）**绑定自定义域名**：bucket → Settings → Custom Domains。域名必须托管在同一 Cloudflare 账号。绑定后把地址（如 `https://dl.yourdomain.com`）填到 `R2_PUBLIC_BASE_URL`，下载/plist 链接将变成永久公开链接（iOS OTA 兼容性最好）。
   - 注意：公开模式下任何人拿到链接都能下载，依靠"key 中含随机 buildKey 不可猜测"保护；若要求链接时效性，则不配置此项，继续用预签名模式。
6. （可选）**生命周期规则**：bucket → Settings → Lifecycle rules，例如自动删除 90 天前的旧包。

## 三、配置环境变量

```bash
cd functions
cp .env.example .env        # 会被部署到线上
# 也可以用 .env.local（仅本地生效，优先级更高）
```

填写 5 个必填项：`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_API_TOKEN`。

`R2_API_TOKEN` 是写接口的共享密钥，自己生成一个，例如：`openssl rand -hex 32`。

> 安全提醒：`.env` / `.env.local` 已加入 `functions/.gitignore`，**绝不提交到 git**；Secret Access Key 只存在 Functions 环境变量里，前端永远拿不到。

## 四、部署与验证

```bash
cd functions
npm install                 # 首次需要（新增了 AWS SDK 依赖）
npm run deploy              # = firebase deploy --only functions

# 验证配置是否生效（无需真实凭据即可访问）
curl https://us-central1-<project>.cloudfunctions.net/appdownload/r2/health
# 期望返回: {"ok":true,"r2Configured":true,"apiTokenConfigured":true,...}

# 本地开发
cd functions && ./run.sh    # NODE_ENV=development + emulators
# 本地地址: http://localhost:5001/<project>/us-central1/appdownload/r2/health
```

## 五、API 文档

所有接口挂在现有 `appdownload` 函数下，前缀 `/r2`。

**鉴权规则：**
- 写/管理接口（upload-url / commit-build / update-build / delete-builds / next-version）：两种方式任一通过即可
  - 带 `x-api-key` 请求头（值 = `R2_API_TOKEN`），适合 CI / jj-cli（无 Referer 也能调）
  - 来自 `https://pgyer-enhance.web.app` 的网页请求（前端管理页无需内嵌 token）
- 读接口（versions / download-url / install-plist）：生产环境走网页 Referer 校验（和现有 `/versions` 一致），由前端页面调用

### 1. `POST /r2/upload-url` — 获取上传链接（第 1 步）

```bash
curl -X POST https://us-central1-<project>.cloudfunctions.net/appdownload/r2/upload-url \
  -H "x-api-key: <R2_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "myapp",
    "platform": "android",
    "version": "1.2.0",
    "fileName": "myapp-1.2.0.apk",
    "env": "prd",
    "appName": "My App",
    "description": "Env: prd, fix login bug",
    "buildNumber": "120"
  }'
```

返回：

```json
{
  "buildKey": "b1730000000abc123",
  "key": "apps/myapp/android/b1730000000abc123/myapp-1.2.0.apk",
  "uploadUrl": "https://xxx.r2.cloudflarestorage.com/...（预签名 PUT 地址）",
  "expiresIn": 1800,
  "headers": { "Content-Type": "application/vnd.android.package-archive" },
  "meta": { ...入参回显，方便直接传给 commit-build... }
}
```

### 2. `PUT <uploadUrl>` — 直传文件到 R2（第 2 步）

```bash
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @myapp-1.2.0.apk
```

> **重要**：PUT 时的 `Content-Type` 必须与返回的 `headers["Content-Type"]` 完全一致，否则 R2 报签名不匹配（SignatureDoesNotMatch）。浏览器端同理：`fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': ct }, body: file })`。
>
> 该接口也可上传 **App 级图标**：body 加 `"appIcon": true`（此时只需 `appId` + `fileName`，不需要 platform/version），key 固定为 `apps/{appId}/icon.png`，详见下方"图标方案"。

### 3. `POST /r2/commit-build` — 登记构建元数据（第 3 步）

上传成功后调用。服务端会先 HEAD 校验文件确实存在，再写入 Firestore。

```bash
curl -X POST .../appdownload/r2/commit-build \
  -H "x-api-key: <R2_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "buildKey": "b1730000000abc123",
    "appId": "myapp",
    "platform": "android",
    "version": "1.2.0",
    "fileName": "myapp-1.2.0.apk",
    "env": "prd",
    "appName": "My App",
    "bundleId": "com.example.myapp",
    "description": "Env: prd, fix login bug",
    "buildNumber": "120",
    "iconKey": "apps/myapp/android/b1730000000abc123/icon.png"   // 可选，构建级图标；不传回退 App 级图标（见"图标方案"）
  }'
```

### 4. `GET /r2/versions?appId=xx&platform=xx&env=xx` — 版本列表

替代 pgyer 的 builds 接口，读 Firestore，毫秒级返回。字段命名与 pgyer 对齐（`buildKey` / `buildVersion` / `buildVersionNo` / `buildUpdateDescription` / `buildFileSize` / `buildCreatedTimestamp` ...），前端可低成本复用。按创建时间倒序；每条记录附带签名好的 `iconUrl`（图标来源见"图标方案"）。

### 4.1 `GET /r2/next-version?appId=xx&platform=xx&env=xx` — 下一个版本号（给 CI 用）

服务端根据 Firestore 数据计算：按 `env` 字段**精确**过滤（不再靠描述字符串匹配），取最大 `buildVersion`（同号比较 `buildVersionNo`），末段 +1。供 jj-cli `getNextVersion` 平移使用：

```bash
curl -H "x-api-key: <R2_API_TOKEN>" \
  ".../appdownload/r2/next-version?appId=myapp&platform=android&env=prd"
# → {"appId":"myapp","platform":"android","env":"prd",
#    "currentVersion":"2.0.0","currentBuildNumber":"200","nextVersion":"2.0.1"}
```

没有任何构建时返回 `nextVersion: "1.0.0"` 作为起始版本。

### 5. `GET /r2/download-url?key=apps/xx/x.apk&expires=604800` — 下载链接

`expires` 可选，默认 7 天，最大 30 天（秒）。公开模式下返回永久自定义域名链接。

### 6. `GET /r2/install-plist?buildKey=xx` — iOS OTA 安装（扫码安装）

流程：读 Firestore → 给 ipa 签 7 天下载 URL → 重新生成 `manifest.plist`（含签名 ipa 地址和图标）→ 上传 R2 → 返回：

```json
{
  "ipaUrl": "https://...（签名后的 ipa 直链）",
  "plistUrl": "https://...（签名后的 plist 地址）",
  "itmsUrl": "itms-services://?action=download-manifest&url=https%3A%2F%2F..."
}
```

前端把 `itmsUrl` 生成二维码，iPhone 用相机/ Safari 扫码即弹安装。

> iOS 注意事项：
> - plist 与 ipa 都必须是 **HTTPS**（R2 满足）
> - 预签名 URL 有有效期：ipa/plist 签 7 天，过期后重新调本接口会**重新生成 plist**，二维码内容也随之更新
> - 追求"二维码永久有效"请配置自定义域名（`R2_PUBLIC_BASE_URL`），链接永久不变
> - 测试设备需在描述文件（Provisioning Profile）内，否则安装时报"无法安装"

### 7. `POST /r2/update-build` — 更新构建信息（对应 pgyer 的 updateApp）

jj-cli 上传后追加 appByodVersion / branch 到更新说明时使用。可选更新字段：`description` / `appName` / `bundleId` / `env` / `buildNumber`。

```bash
curl -X POST .../appdownload/r2/update-build \
  -H "x-api-key: <R2_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{ "buildKey": "b1730000000abc123", "description": "prd:\nEnv: prd\n* appByodVersion: 2.1\n* source: feature/x" }'
```

### 8. `POST /r2/delete-builds` — 删除构建

```bash
curl -X POST .../appdownload/r2/delete-builds \
  -H "x-api-key: <R2_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{ "buildKeys": ["b1730000000abc123"] }'
```

返回 `{ deleted: 数量, results: [...] }`。并行删除 R2 上的包文件 + plist + Firestore 记录。

### 9. `GET /r2/health` — 健康检查

返回 R2 配置状态（不泄露任何密钥）。

### 图标方案（三层兜底）

`/r2/versions` 的 `iconUrl` 与 `/r2/install-plist` 安装弹窗图标按以下顺序取值：

1. **构建级图标**：上传时 jj-cli 自动从 apk/ipa 提取图标 → 用 `upload-url` 上传 → `commit-build` 传 `iconKey`。图标随版本自动更新。
2. **App 级图标**（构建没传 `iconKey` 时自动回退）：固定 key `apps/{appId}/icon.png`，手动传一次长期有效。上传方式（`appIcon: true` 时不要求 platform/version）：

   ```bash
   curl -X POST .../appdownload/r2/upload-url \
     -H "x-api-key: <R2_API_TOKEN>" -H "Content-Type: application/json" \
     -d '{"appId":"myapp","fileName":"icon.png","appIcon":true}'
   # → key 固定为 apps/myapp/icon.png，PUT 上传后全局生效
   ```

3. **前端占位图**：预签名模式下，若 App 级图标也不存在，`iconUrl` 仍会返回（对象不存在时加载 403/404），前端 `<img>` onerror 显示 App 名首字母占位即可。

## 六、元数据结构（R2 meta.json，无外部数据库）

项目 Firestore 为 Datastore Mode 不可用，元数据直接作为 `meta.json` 存在 R2 中，与安装包同目录、同生命周期（删除构建 = 删除整个 buildKey 目录）。

```
apps/{appId}/icon.png                              App 级图标（可选，全局共用）
apps/{appId}/{platform}/{env}/{buildKey}/package.apk     安装包
apps/{appId}/{platform}/{env}/{buildKey}/icon.png        构建级图标（可选）
apps/{appId}/{platform}/{env}/meta.json             构建元数据（整个 env 一个文件，builds 数组）
plists/{buildKey}.plist                            iOS 安装清单（按需生成）
```

env 级 meta.json 结构：`{ "updatedAt": ts, "builds": [ {…一条构建…}, … ] }`，builds 内字段与 pgyer 的 buildXXX 命名对齐（前端零改动）：

| 字段 | 说明 |
|---|---|
| `buildKey` | 唯一 ID（b+时间戳+随机），目录名/plist 名 |
| `appId` / `platform` / `env` | 查询维度（ios/android；uat/prd...） |
| `appName` / `bundleIdentifier` | 展示名 / iOS plist 需要 |
| `key` / `iconKey` | 包文件 / 图标的 R2 路径 |
| `buildVersion` / `buildVersionNo` | 版本号 / 构建号 |
| `buildUpdateDescription` | 更新说明（沿用 "Env: prd" 约定） |
| `buildFileName` / `buildFileSize` | 文件名 / 字节大小 |
| `buildCreatedTimestamp` / `updatedAt` | 毫秒时间戳 |

查询实现：列表接口 = 每个 env 一次 GET 读入全部 builds（不再逐 build 读取），排序在内存完成。写入（commit/update/delete）采用读-改-写 + 写后验证重试，防止并发上传竞态。

## 七、费用参考

| 项目 | 计费 | 你的量级估算 |
|---|---|---|
| R2 存储 | 10G 免费，超出 $0.015/GB/月 | 100G ≈ **$1.35/月** |
| R2 下载流量 | **免费** | 不限 |
| R2 请求 | 写 $4.5/百万、读 $0.36/百万 | 可忽略 |
| Cloud Functions | 200 万次/月等免费额度 | 签 URL 仅几十 ms，基本 $0 |
| Firestore | 5 万读/2 万写/天 免费 | 足够 |

## 八、常见问题（FAQ）

1. **PUT 上传报 403 SignatureDoesNotMatch** → PUT 的 `Content-Type` 与 `upload-url` 返回的不一致。
2. **浏览器直传报 CORS 错误** → 没配 bucket CORS（见第二节第 4 步），或域名没加进 `AllowedOrigins`。
3. **写接口 401 invalid api key** → `x-api-key` 头缺失或与 `R2_API_TOKEN` 不符；503 表示服务端没配置 `R2_API_TOKEN`。
4. **写接口线上被拒（"Please don't do like this!"）** → 只有 upload-url / commit-build / delete-builds / health 免 Referer；其余路径生产环境要求网页来源。
5. **iOS 扫码安装失败** → ① 链接过期（重新生成二维码/配置自定义域名）；② 设备 UDID 不在证书描述文件里；③ plist 里 ipa 地址非 HTTPS。
6. **commit-build 报 file not found** → 先完成第 2 步 PUT 再 commit；检查 key 是否与 upload-url 返回的一致。
7. **本地 emulators 调 R2 接口** → `.env.local` 同样会被 firebase emulators 加载；Firestore 需 `firebase emulators:start --only functions,firestore` 并设置 `FIRESTORE_EMULATOR_HOST`。

## 九、渐进迁移指南（pgyer 与 R2 并存）

旧版本仍在 pgyer 上，迁移是逐项目、逐环境进行的。三端已全部支持并存：

### 1. jj-cli 上传分流（按项目/按环境开关）

在 `jj.config.json` 的项目里加 `r2` 段即可，**上传命令完全不变**：

```json
{
  "name": "myapp",
  "pgyer": { "...": "保持不动" },
  "r2": {
    "enabled": true,
    "envs": ["uat"],
    "endpoint": "https://us-central1-aigensstoretest.cloudfunctions.net/appdownload",
    "token": "<R2_API_TOKEN>"
  }
}
```

- `envs: ["uat"]` → 只有 uat 走 R2，prd 仍走 pgyer（灰度期推荐）
- `envs: []` 或不填 → 该项目所有环境都走 R2（完全迁移）
- 删除 `r2` 段或 `enabled: false` → 回到纯 pgyer（随时可退）

`j payer-nextversion` 命令同样按此开关分流（R2 模式调 `/r2/next-version`，不再拉全量版本列表）。

### 2. 前端版本列表自动合并

前端已改为调用 `GET /r2/merged-versions`：一次返回 pgyer 旧版本 + R2 新版本的**合并列表**（按时间倒序），响应格式与旧接口完全一致。R2 记录带 `isR2: true` 标记和橙色 **R2** 徽章；下载/删除/编辑描述按来源自动分流到对应接口。任一数据源故障自动降级为单源显示。

### 3. jj-cli 发布注意

jj-cli 发布走 `dist/`（`npm run build`），本地调试可把 `jj-cli/package.json` 的 `"debug": true` 直接加载 `lib/`。

## 十、安全清单

- [x] Secret 只存 Functions 环境变量，`.env*` 已 gitignore
- [x] R2 token 只授予单 bucket 的 Object Read & Write
- [x] bucket 私有，下载走带时效的预签名 URL（或不可猜测 key 的公开域名）
- [x] 写接口强制 `x-api-key`，防止陌生人刷存储
- [x] 预签名 GET 只允许 `apps/`、`plists/` 前缀
