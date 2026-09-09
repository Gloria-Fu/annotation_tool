# Annotate Tool

LeRobot v2.1 数据标注管理平台 MVP。平台负责账号、项目、数据导入、任务领取、审核、抽检和统计；具体标注编辑器通过通用 JSON 修订接口后续接入。

## 启动

```bash
cp .env.example .env
# 在 .env 中设置 DATASET_HOST_PATH 和初始管理员密码
docker compose up --build
```

访问 <http://localhost:18000>。首次登录必须修改初始密码。

数据集目录挂载到 `/datasets`，平台只会在数据集下的 `annotations` 子目录生成标注版本文件，不会修改原始元数据、Parquet 或视频。登记数据集时填写容器内路径，例如 `/datasets/agibot-episode0-v21_old`。

## 本地开发

后端使用 Python 3.12，前端使用 Node.js 22。常用命令：

```bash
cd backend && pip install -r requirements-dev.txt && pytest
cd frontend && npm install && npm run build
```
