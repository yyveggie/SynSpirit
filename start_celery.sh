#!/bin/bash

# 获取当前项目根目录的绝对路径
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 输出彩色日志
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========== SynSpirit Celery Worker 启动脚本 ==========${NC}"

# 检查并停止已有的Celery进程
echo -e "${YELLOW}检查并停止可能正在运行的旧Celery实例...${NC}"

if [ -f "$PROJECT_ROOT/.celery_pid" ]; then
  CELERY_PID=$(cat "$PROJECT_ROOT/.celery_pid")
  if ps -p $CELERY_PID > /dev/null; then
    echo -e "${YELLOW}发现正在运行的Celery进程，正在停止: $CELERY_PID ${NC}"
    kill -TERM $CELERY_PID
    sleep 1
    # 确保进程已经终止
    if ps -p $CELERY_PID > /dev/null; then
      echo -e "${YELLOW}进程仍在运行，强制终止...${NC}"
      kill -9 $CELERY_PID 2>/dev/null # 如果还在运行，强制杀死
    fi
  else
    echo -e "${YELLOW}PID文件存在但进程不存在，清理文件...${NC}"
  fi
  rm -f "$PROJECT_ROOT/.celery_pid"
fi

# 确保日志目录存在
if [ ! -d "$PROJECT_ROOT/logs" ]; then
  echo -e "${YELLOW}创建日志目录...${NC}"
  mkdir -p "$PROJECT_ROOT/logs"
fi

# 激活conda环境
echo -e "${GREEN}激活 conda 环境: lynn...${NC}"
source ~/anaconda3/etc/profile.d/conda.sh || { echo -e "${RED}错误：无法 source conda 脚本。请检查路径或 conda 初始化设置。${NC}"; exit 1; }
conda activate lynn || { echo -e "${RED}错误：无法激活 conda 环境 'lynn'。${NC}"; exit 1; }

# 切换到后端目录
cd "$PROJECT_ROOT/backend" || { echo -e "${RED}错误：无法进入后端目录 '$PROJECT_ROOT/backend'。${NC}"; exit 1; }
echo -e "${GREEN}当前目录: $(pwd)${NC}"

# 启动Celery Worker
echo -e "${GREEN}正在启动Celery Worker...${NC}"

# 当前时间作为日志文件名的一部分，确保每次运行创建新的日志文件
LOG_TIMESTAMP=$(date "+%Y%m%d_%H%M%S")
LOG_FILE="$PROJECT_ROOT/logs/celery_${LOG_TIMESTAMP}.log"

echo -e "${YELLOW}Celery日志将写入: $LOG_FILE${NC}"

# 启动Celery Worker，确保监听所有需要的队列
# 注意：如果希望直接在终端看到日志而不是写入文件，可以去掉 "> $LOG_FILE 2>&1" 部分
celery -A app.celery_utils.celery worker --loglevel=info --pool=gevent -c 20 -O fair --prefetch-multiplier=1 -Q celery,updates,ai_generation &

CELERY_PID=$!
echo -e "${GREEN}Celery Worker已启动，PID: $CELERY_PID${NC}"

# 保存Celery PID到临时文件
echo $CELERY_PID > "$PROJECT_ROOT/.celery_pid"

# 捕获SIGINT和SIGTERM信号以进行清理
cleanup() {
    echo -e "${YELLOW}收到停止信号，正在停止Celery Worker...${NC}"
    if [ -f "$PROJECT_ROOT/.celery_pid" ]; then
        CPID=$(cat "$PROJECT_ROOT/.celery_pid")
        echo -e "${YELLOW}停止Celery Worker (PID: $CPID)...${NC}"
        kill -TERM $CPID 2>/dev/null
        sleep 1
        # 确保进程已终止
        if ps -p $CPID > /dev/null; then
            echo -e "${YELLOW}Celery进程仍在运行，强制终止...${NC}"
            kill -9 $CPID 2>/dev/null
        fi
        rm -f "$PROJECT_ROOT/.celery_pid"
    fi
    echo -e "${GREEN}Celery Worker已停止。${NC}"
    exit 0
}

trap cleanup INT TERM

echo -e "${YELLOW}Celery Worker正在运行中... 按 Ctrl+C 停止${NC}"
echo -e "${YELLOW}提示: 可以使用 'tail -f $LOG_FILE' 查看日志${NC}"

# 等待Celery Worker进程
wait $CELERY_PID 