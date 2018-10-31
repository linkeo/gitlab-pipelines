# gitlab-pipelines
[Chrome Extension] Gitlab Pipelines - Show Gitlab pipelines of multiple projects in one place

介绍：Chrome 浏览器插件，可以在一处查看多个项目的 Pipeline 执行情况，并提供任务情况的推送通知。

用法：

- 配置接口：点击扩展图标，在打开的小窗口中点击齿轮配置 Gitlab API 地址以及个人的 Access Token
- 添加项目：在 Gitlab 中将需要查看 Pipeline 的项目设为星标项目
- 点击扩展图标，可以查看当前正在执行的 Pipeline，点击任务可以打开对应的 Pipeline 页面
- 每当 Pipeline 创建/失败/完成/取消的时候，都会收到Chrome的推送通知

## Features

- Show pipelines in extension popup page.
- Notifications on pipelines' creation, completion, failure or cancellation.

## Configuration

- Open extension popup page, click gear icon to goto configuration page.
- Input URL of your Gitlab API, and your personal access token.
- If your want to track a project by this extension, just star it.

