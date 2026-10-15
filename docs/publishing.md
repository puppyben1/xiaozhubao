# 博客内容管理

手动在地址栏输入 `/admin`。访客页面没有管理或编辑入口；未登录会转到 `/admin/login`。登录后可以发布新内容，退出登录后无法打开管理台及所有编辑页。

- `/posts/new`：文章、笔记和问题的 Markdown 编辑、基础预览、本地草稿、下载与新文章发布。
- `/moments/new`：动态编辑、预览和图片上传。
- `/photos/new`：相册编辑和图片上传。
- 旧 `/thoughts/new` 自动转到 `/moments/new`。原照片编辑器已移到 `/photos/new`。

当前是新内容发布管理，尚不支持从网页读取、编辑和删除已有内容。文章草稿仅保存在当前浏览器；更换设备前请下载备份。下载的 Markdown 默认标记 `draft: true`，需要自行提交时改成 `false` 才会在生产站展示。

## Vercel 配置

在当前博客项目的 Settings → Environment Variables 配置，再重新部署：

| 变量                | 值或要求                                                             |
| ------------------- | -------------------------------------------------------------------- |
| `SITE_URL`          | `https://xiaozhubao.top`                                             |
| `CONTENT_REPO`      | `puppyben1/xiaozhubao`                                               |
| `CONTENT_BRANCH`    | `main`                                                               |
| `GITHUB_TOKEN`      | 只允许该内容仓库的 GitHub fine-grained token，需要 Contents 读写权限 |
| `ADMIN_USERNAME`    | 管理员账号，默认 `puppyben`                                          |
| `ADMIN_PASSWORD`    | 管理页登录密码，使用至少 20 位的随机密码，仅保存在服务端             |
| `THOUGHT_API_TOKEN` | 服务端发布及图床凭证，使用独立随机值；不再输入网页                   |
| `SITE_TIMEZONE`     | `Asia/Shanghai`                                                      |
| `R2_IMAGE_BASE_URL` | 自己部署的兼容图片签名上传服务地址，可选                             |

登录页输入管理员账号和密码。`ADMIN_USERNAME` 默认为 `puppyben`，`ADMIN_PASSWORD` 为管理员密码。GitHub Token 和 `THOUGHT_API_TOKEN` 仅填服务器环境变量，不会发送到编辑页。管理页显示变量是否填写，不验证仓库权限或图床连接。正确性会在真实发布、上传时验证。

图床服务需支持 `POST /api/upload/sign`、返回一次性 `uploadUrl` 和上传 headers，再支持 `POST /api/upload/complete` 返回公开图片 URL，并验证转发的 Bearer 发布凭证。仅配置 R2 桶或公开图片域名不能直接上传。未配置图床时，自动使用 GitHub 保存图片到 `public/uploads/`，无需额外环境变量。单张上传限制 4 MB，服务端验证并转为 WebP、去除元数据，最大边长 2560。图片使用固定提交的 GitHub Raw 地址，可以立即预览；访问速度取决于访客到 GitHub 的网络。上传图片本身也会产生提交并触发部署。此方式适用于公开博客仓库；大量照片可再接独立图床。

文章会创建 `src/content/posts/web/<网址标识>.md`，网址为 `/posts/<网址标识>`。动态保留原内容目录。接口只创建新文件，不传 GitHub `sha`，已有标识产生冲突时会提示，不覆盖原内容。网络异常时先检查 GitHub 是否已收到提交，避免误认失败后再发一份。

成功提交以后，绑定这个仓库和分支的 Vercel 才会触发构建。内容仓库必须与当前站点的构建来源一致；如果指定其他仓库，需要自行配置内容同步，当前实现不负责同步。

管理页面由服务器验证签名会话，Cookie 为 HttpOnly、SameSite=Strict，线上使用 Secure，12 小时后过期。修改 ADMIN_PASSWORD 会使所有旧会话失效。登录、退出及使用 Cookie 的发布请求校验同源 Origin，避免跨站提交。原 Bearer 接口仍可用正确的服务端发布凭证调用。所有管理页面标记 noindex，设置 no-store，并绕过 Service Worker 缓存及客户端路由。管理密码不得提交仓库；建议在 Vercel Firewall 为 `/admin/login` 的 POST 设置速率限制（无共享数据库，应用没有持久的跨实例登录限流）。

## 本地检查

`npm run check:admin` 检查密码、会话签名、过期、轮换及跨站请求拒绝。

`npm run check:images` 检查上传鉴权、大小与格式限制、GitHub 图片写入及非 JSON 错误。

`npm run check:publishing` 检查文章和动态的服务端鉴权、输入校验、Markdown 元数据、GitHub 创建请求、冲突与错误，以及预览转义。检查使用模拟 GitHub 响应，不写真实仓库。

`npm run build` 完成 Astro 类型检查和 Vercel 构建。`npm run dev -- --host 127.0.0.1 --port 4323` 后可访问 `/admin`。本地 `npm run dev` 自动读取 Git 忽略的 `.env.local`；账号及密码只写入此文件，不写入源码或 Git。线上仍需在 Vercel 设置对应环境变量。

没有 ADMIN_PASSWORD 时登录禁用；没有配置发布环境变量时，新文章发布会禁用，动态接口返回明确的未配置错误。真实 GitHub 写入、图片上传、Vercel 自动部署需要在配置后单独验证。

发布与上传路由由 `src/pages/api/` 经 Astro/Vite 打包，不能在根 `api/` 重复注册同名 Vercel 函数，以免绕过打包并产生运行时模块加载错误。
