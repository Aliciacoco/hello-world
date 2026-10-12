# iPhone 积分组件与每日通知

## 部署要求

网站地址：https://coco-os.cn。2026-10-12 已通过 Certbot 配置证书、放行 443 端口，并确认 HTTPS 返回 200。

正式桌面组件与 iPhone 网页通知均使用 HTTPS。请从 HTTPS 地址打开网站；HTTP 页面会禁用组件下载与推送。

沿用项目原有 GitHub Actions 部署方式：`npm run build`，同步全部 `dist/` 和后端源码，安装后端依赖并重启 PM2。新增后端文件包括 `mobile-reminders.js` 与 `points-widget.js`。

Nginx 的 `/api/` 继续转发到 Express，并设置：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

Express 仅信任 loopback 地址的代理，适用于同机 Nginx → Express；其他代理拓扑需按实际可信地址调整。

`/sw.js`、`/manifest.webmanifest` 和 `/app-icon-*.png` 必须直接返回对应静态文件，不能返回 index.html。`/sw.js` 建议设置 `Cache-Control: no-cache`。确认 HTTPS 页面与 `/api/mobile/config` 均可访问后，再让 HTTP 重定向到 HTTPS。

Web Push 密钥首次启动自动生成，无需注册额外推送平台。默认 VAPID subject 使用订阅时的网站地址；可用环境变量 `VAPID_SUBJECT=mailto:你的邮箱` 覆盖。

## 运行时数据

DATA_DIR 下的 `mobile_reminders.json` 保存密钥、设备订阅、组件只读凭证和每天的发送记录，`.tmp` 为原子写入临时文件。均已加入 .gitignore。备份时包含该文件，部署时不能用本地测试数据覆盖它。丢失文件后旧组件和订阅都会失效；文件损坏时报错，不会自动覆盖原数据。

项目沿用单人共享账户模式，手机设置接口与原积分接口采用同样的访问方式。若开放给多人，需要一并加入账户与鉴权。

## 桌面组件

1. 安装 Scriptable。
2. 在 iPhone 打开 HTTPS 网站的积分页，点击“下载 iPhone 组件”。
3. 在“文件”里将 StudyPoints.js 分享给 Scriptable；没有导入选项时，用文本方式打开文件，把全部代码粘贴进 Scriptable 新建脚本。
4. 运行一次，确认显示正确积分。
5. 长按桌面，添加 Scriptable 中号组件，编辑组件并选择 StudyPoints 脚本。
6. 锁屏编辑界面可添加 Scriptable 矩形组件。

点击组件打开积分兑换窗口。中号显示余额、可消费金额、今日获得与消费；锁屏显示余额与消费金额。沿用 1 分 = 1 元。刷新由 iOS 调度，15 分钟只是最早刷新时间。离线显示缓存和上次同步时间；凭证重置后需要重新下载。凭证仅可读取积分摘要，请不要分享脚本。

## 每日通知

1. Safari 打开 HTTPS 网站，分享 → 添加到主屏幕。
2. 从主屏幕打开练习本，在积分页选时间与时区（默认北京时间 20:00）。
3. 点“开启每日提醒”并允许通知。
4. 点“测试通知”，查看通知中心；点击通知应打开兑换窗口。

提醒按设备保存。后端每 30 秒检查一次，计划时间后 30 分钟内可以补发；成功后当天不再重复。失败延迟 15 分钟重试，过期订阅移除。服务器需要保持运行且能连接浏览器推送服务，iPhone 的专注模式等系统设置仍会影响展示时机。

## 验证

```powershell
node --test server/mobile-reminders.test.js
npm run build
```

测试使用独立临时目录和模拟推送服务，不读写实际积分，不给手机发消息。真实 iPhone 通知与 Scriptable 渲染需在部署后验证。
