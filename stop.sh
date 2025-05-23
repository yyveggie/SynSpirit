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

echo -e "${GREEN}========== SynSpirit 项目停止脚本 ==========${NC}"

# 方法1: 使用保存的PID (如果可用)
if [ -f "$PROJECT_ROOT/.backend_pid" ] || [ -f "$PROJECT_ROOT/.frontend_pid" ] || [ -f "$PROJECT_ROOT/.celery_pid" ]; then
  echo -e "${YELLOW}使用保存的PID停止服务...${NC}"
  
  # 停止后端服务
  if [ -f "$PROJECT_ROOT/.backend_pid" ]; then
    BACKEND_PID=$(cat "$PROJECT_ROOT/.backend_pid")
    
    if kill -0 $BACKEND_PID 2>/dev/null; then
      echo -e "${YELLOW}停止后端进程 (PID: $BACKEND_PID)...${NC}"
      kill -9 $BACKEND_PID
    else
      echo -e "${RED}后端 PID $BACKEND_PID 已不存在${NC}"
    fi
    
    rm -f "$PROJECT_ROOT/.backend_pid"
  fi
  
  # 停止前端服务
  if [ -f "$PROJECT_ROOT/.frontend_pid" ]; then
    FRONTEND_PID=$(cat "$PROJECT_ROOT/.frontend_pid")
    
    if kill -0 $FRONTEND_PID 2>/dev/null; then
      echo -e "${YELLOW}停止前端进程 (PID: $FRONTEND_PID)...${NC}"
      kill -9 $FRONTEND_PID
    else
      echo -e "${RED}前端 PID $FRONTEND_PID 已不存在${NC}"
    fi
    
    rm -f "$PROJECT_ROOT/.frontend_pid"
  fi
  
  # 停止Celery Worker
  if [ -f "$PROJECT_ROOT/.celery_pid" ]; then
    CELERY_PID=$(cat "$PROJECT_ROOT/.celery_pid")
    
    if kill -0 $CELERY_PID 2>/dev/null; then
      echo -e "${YELLOW}停止Celery Worker进程 (PID: $CELERY_PID)...${NC}"
      # 先发送TERM，给进程机会优雅退出
      kill -TERM $CELERY_PID
      sleep 2
      # 如果进程还存在，强制杀死
      if kill -0 $CELERY_PID 2>/dev/null; then
        kill -9 $CELERY_PID
      fi
    else
      echo -e "${RED}Celery Worker PID $CELERY_PID 已不存在${NC}"
    fi
    
    rm -f "$PROJECT_ROOT/.celery_pid"
  fi
  
  echo -e "${GREEN}已删除PID文件${NC}"
else
  echo -e "${YELLOW}未找到PID文件，尝试通过端口停止进程...${NC}"
  
  # 方法2: 通过端口查找进程
  # 停止后端服务
  BACKEND_PIDS=$(lsof -ti:$BACKEND_PORT)
  if [ ! -z "$BACKEND_PIDS" ]; then
    echo -e "${YELLOW}停止后端进程 (PID: $BACKEND_PIDS)...${NC}"
    kill -9 $BACKEND_PIDS
  else
    echo -e "${RED}未发现监听 $BACKEND_PORT 端口的后端进程${NC}"
  fi
  
  # 停止前端服务
  FRONTEND_PIDS=$(lsof -ti:$FRONTEND_PORT)
  if [ ! -z "$FRONTEND_PIDS" ]; then
    echo -e "${YELLOW}停止前端进程 (PID: $FRONTEND_PIDS)...${NC}"
    kill -9 $FRONTEND_PIDS
  else
    echo -e "${RED}未发现监听 $FRONTEND_PORT 端口的前端进程${NC}"
  fi
  
  # 尝试查找并停止Celery进程
  echo -e "${YELLOW}尝试查找并停止Celery进程...${NC}"
  CELERY_PIDS=$(ps aux | grep '[c]elery worker' | awk '{print $2}')
  if [ ! -z "$CELERY_PIDS" ]; then
    echo -e "${YELLOW}停止Celery进程 (PID: $CELERY_PIDS)...${NC}"
    kill -TERM $CELERY_PIDS
    sleep 2
    # 如果进程还存在，强制杀死
    for PID in $CELERY_PIDS; do
      if kill -0 $PID 2>/dev/null; then
        kill -9 $PID
      fi
    done
  else
    echo -e "${RED}未发现Celery Worker进程${NC}"
  fi
fi

echo -e "${GREEN}所有服务已停止${NC}" 