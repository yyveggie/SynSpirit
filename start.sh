#!/bin/bash

# 获取当前项目根目录的绝对路径
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_PORT=5001
FRONTEND_PORT=3000

# 输出彩色日志
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========== SynSpirit 项目启动脚本 ==========${NC}"

# 检查并停止已有的进程
echo -e "${YELLOW}检查并停止可能正在运行的旧实例...${NC}"

# 检查并停止后端服务
BACKEND_PIDS=$(lsof -ti:$BACKEND_PORT)
if [ ! -z "$BACKEND_PIDS" ]; then
  echo -e "${YELLOW}发现 $BACKEND_PORT 端口占用，正在停止进程: $BACKEND_PIDS ${NC}"
  kill -9 $BACKEND_PIDS
  sleep 1
fi

# 检查并停止前端服务
FRONTEND_PIDS=$(lsof -ti:$FRONTEND_PORT)
if [ ! -z "$FRONTEND_PIDS" ]; then
  echo -e "${YELLOW}发现 $FRONTEND_PORT 端口占用，正在停止进程: $FRONTEND_PIDS ${NC}"
  kill -9 $FRONTEND_PIDS
  sleep 1
fi

# 注意：Celery进程现在由单独的脚本管理，不在此脚本中启动或停止

# 激活conda环境
echo -e "${GREEN}激活 conda 环境: lynn...${NC}"
# 注意: 确保 conda 初始化脚本路径正确
# 对于 Zsh 用户，可能是 ~/.zshrc 或 ~/.bash_profile 中的 conda init 部分
# 对于 Bash 用户，可能是 ~/.bashrc 或 ~/.bash_profile
# 如果下面的 source 命令无效，请检查你的 shell 配置文件中 conda init 的内容
# 或者尝试使用 conda run -n lynn --no-capture-output <command> 的方式
source ~/anaconda3/etc/profile.d/conda.sh || { echo -e "${RED}错误：无法 source conda 脚本。请检查路径或 conda 初始化设置。${NC}"; exit 1; }
conda activate lynn || { echo -e "${RED}错误：无法激活 conda 环境 'lynn'。${NC}"; exit 1; }

# 启动后端服务
# 进入后端目录执行命令
cd "$PROJECT_ROOT/backend" || { echo -e "${RED}错误：无法进入后端目录 '$PROJECT_ROOT/backend'。${NC}"; exit 1; }
echo -e "${GREEN}当前目录: $(pwd)${NC}"
echo -e "${GREEN}正在启动后端服务 (使用 Gunicorn)...${NC}"
# 使用 conda run 确保在正确的环境中执行 python
# --no-capture-output 允许脚本输出直接显示
# conda run -n lynn --no-capture-output python run.py &

# --- 使用 Gunicorn 启动 (针对 Flask-SocketIO 优化) ---
# 获取配置中的 HOST 和 PORT
echo -e "${YELLOW}获取API配置...${NC}"
# 创建临时Python脚本读取配置
cat > /tmp/read_config.py << 'EOL'
from app.config import API_HOST, API_PORT
print(f"{API_HOST}")
print(f"{API_PORT}")
EOL

# 运行临时脚本并读取结果到数组
CONFIGS=()
while IFS= read -r line; do
  CONFIGS+=("$line")
done < <(python /tmp/read_config.py)

# 分配变量
API_HOST="${CONFIGS[0]}"
API_PORT="${CONFIGS[1]}"

# 检查获取的值是否有效
if [ -z "$API_HOST" ]; then
  echo -e "${YELLOW}警告: 无法从配置获取API_HOST，使用默认值 0.0.0.0${NC}"
  API_HOST="0.0.0.0"
fi

if [ -z "$API_PORT" ] || ! [[ "$API_PORT" =~ ^[0-9]+$ ]]; then
  echo -e "${YELLOW}警告: 无法从配置获取有效的API_PORT，使用默认值 5001${NC}"
  API_PORT="5001"
fi

echo -e "${GREEN}使用API配置: HOST=$API_HOST PORT=$API_PORT${NC}"

# 动态计算 worker 数量，如果 nproc 命令失败则默认为 4
if command -v nproc &> /dev/null; then
  WORKER_COUNT=$(($(nproc) * 2 + 1))
else
  echo -e "${YELLOW}警告: 'nproc' 命令未找到，无法动态计算 worker 数量。将使用默认值 4。${NC}"
  WORKER_COUNT=4
fi

# 使用 GeventWebSocketWorker 以支持 Flask-SocketIO
# 保留现有的 $WORKER_COUNT 计算逻辑
NEW_WORKER_CLASS="geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
BIND_ADDRESS="${API_HOST}:${API_PORT}"
echo -e "${YELLOW}使用 Gunicorn 启动，Workers: $WORKER_COUNT, Worker Class: $NEW_WORKER_CLASS, Bind: $BIND_ADDRESS${NC}"

# --- 修改：确保使用正确的绑定地址 ---
gunicorn --workers 3 --worker-class $NEW_WORKER_CLASS --worker-connections 2000 --bind "$BIND_ADDRESS" --log-level info run:app &
# --- 结束修改 ---

BACKEND_PID=$!
echo -e "${GREEN}后端服务已启动，PID: $BACKEND_PID${NC}"

# 等待后端服务启动并检查可用性
echo -e "${YELLOW}等待后端服务准备就绪...${NC}"
MAX_RETRIES=15 # 增加重试次数
RETRY_COUNT=0
RETRY_DELAY=2 # 增加等待时间

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # 检查后端服务进程是否存在
  if ! ps -p $BACKEND_PID > /dev/null; then
    echo -e "${RED}错误：后端服务进程 $BACKEND_PID 已退出！请检查后端日志。${NC}"
    exit 1
  fi
  # 尝试连接健康检查端点
  if curl -s --max-time 1 "http://localhost:$API_PORT/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}后端服务已准备就绪!${NC}"
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT+1))
  
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}等待后端服务超时 (尝试 $MAX_RETRIES 次，每次间隔 $RETRY_DELAY 秒)。请检查后端日志。脚本将退出。${NC}"
     kill $BACKEND_PID # 尝试停止已启动但未就绪的后端
    exit 1
  else
    echo -e "${YELLOW}后端尚未就绪 (尝试 $RETRY_COUNT/$MAX_RETRIES)，等待 ${RETRY_DELAY} 秒...${NC}"
    sleep $RETRY_DELAY
  fi
done

# 启动前端服务
# ================== 前端启动 ==================
# !! 重要 !!
# 必须进入前端目录执行 npm 命令，以确保使用正确的 package.json 和 node_modules
echo -e "${GREEN}切换到前端目录...${NC}"
cd "$PROJECT_ROOT/frontend" || { echo -e "${RED}错误：无法进入前端目录 '$PROJECT_ROOT/frontend'。${NC}"; kill $BACKEND_PID; exit 1; }
echo -e "${GREEN}当前目录: $(pwd)${NC}"

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
  echo -e "${RED}错误：前端依赖目录 'node_modules' 不存在！${NC}"
  echo -e "${YELLOW}请先在 '$PROJECT_ROOT/frontend' 目录下运行 'npm install' 安装依赖。${NC}"
  kill $BACKEND_PID # 停止已启动的后端
  exit 1
fi

echo -e "${GREEN}正在启动前端服务 (npm start)...${NC}"
# 在后台运行 npm start
npm start &
FRONTEND_PID=$!
echo -e "${GREEN}前端服务已启动，PID: $FRONTEND_PID${NC}"
# ============================================

echo -e "${GREEN}前端和后端服务已启动!${NC}"
echo -e "${YELLOW}后端地址: http://localhost:$API_PORT${NC}"
echo -e "${YELLOW}前端地址: http://localhost:$FRONTEND_PORT${NC}"
echo -e "${YELLOW}注意: Celery需要使用单独的脚本 './start_celery.sh' 启动${NC}"
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"

# 保存PID到临时文件，方便其他脚本使用
# 注意：如果脚本异常退出，这些文件可能不会被清理
echo $BACKEND_PID > "$PROJECT_ROOT/.backend_pid"
echo $FRONTEND_PID > "$PROJECT_ROOT/.frontend_pid"

# 捕获SIGINT和SIGTERM信号以进行清理
cleanup() {
    echo -e "${YELLOW}收到停止信号，正在停止服务...${NC}"
    # 检查PID文件是否存在并读取PID
    if [ -f "$PROJECT_ROOT/.backend_pid" ]; then
        BPID=$(cat "$PROJECT_ROOT/.backend_pid")
        echo -e "${YELLOW}停止后端服务 (PID: $BPID)...${NC}"
        # 使用 kill -TERM (15) 而不是 -9，给进程一个清理的机会
        kill -TERM $BPID 2>/dev/null
        sleep 1 # 等待进程退出
        kill -9 $BPID 2>/dev/null # 如果还在运行，强制杀死
        rm -f "$PROJECT_ROOT/.backend_pid"
    fi
     if [ -f "$PROJECT_ROOT/.frontend_pid" ]; then
        FPID=$(cat "$PROJECT_ROOT/.frontend_pid")
        echo -e "${YELLOW}停止前端服务 (PID: $FPID)...${NC}"
        kill -TERM $FPID 2>/dev/null
        sleep 1
        kill -9 $FPID 2>/dev/null
        rm -f "$PROJECT_ROOT/.frontend_pid"
    fi
    # 注意：不再处理Celery进程，由专门的脚本负责
    echo -e "${GREEN}前端和后端服务已停止。${NC}"
    exit 0 # 正常退出
}

trap cleanup INT TERM

# 等待后台进程结束
# 'wait' 会等待所有后台子进程结束
# 如果只想等待特定的 PID，可以使用 wait $BACKEND_PID $FRONTEND_PID
# 但通常等待所有子进程是期望的行为
wait