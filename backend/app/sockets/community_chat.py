"""
此模块包含与社区主题聊天相关的 Socket.IO 事件处理器。

功能:
- 处理用户加入/离开聊天室 (join/leave 事件)
- 处理用户发送消息 (send_message 事件), 包括 @lynn 指令
- 处理客户端请求历史消息 (request_history 事件)
- 处理客户端断开连接 (disconnect 事件，在此处处理与社区聊天相关的清理)

依赖:
- Flask-SocketIO (socketio 实例需要从外部传入)
- 应用配置和日志 (current_app)
- 数据库模型 (User, ChatRoom, ChatMessage, Topic)
- sid_to_user 映射 (从 app.__init__ 导入)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改。
"""
from flask_socketio import emit, join_room, leave_room
from flask import request, current_app
import traceback
import json
from app.models import User, ChatRoom, ChatMessage, Topic # 导入所需的模型

# 从主应用模块导入 sid_to_user 映射
# 注意: 这创建了一个潜在的循环导入风险，虽然在运行时通常没问题，
# 但不是最佳实践。更好的方法是将 sid_to_user 的管理也移出 __init__.py。
# 暂时先这样处理以完成重构。
try:
    # 假设 sid_to_user 在 app 包的顶层 __init__.py 中定义
    from .. import sid_to_user 
except ImportError:
    # 在某些测试或独立运行场景下，可能无法导入，提供一个默认值
    current_app.logger.warning("Could not import sid_to_user from app, using local dict.")
    sid_to_user = {}


# --- 事件处理器函数定义 (无 @socketio 装饰器) ---
# (这里将稍后填充函数体)

def handle_disconnect():
    """
    处理客户端断开连接事件
    核心功能：清理用户会话数据，避免内存泄漏
    注意事项：确保从sid_to_user映射中移除断开连接的客户端
    """
    logger = current_app.logger
    logger.info(f'[Community Chat] Socket客户端断开连接: {request.sid}')
    # 清理用户ID映射
    if request.sid in sid_to_user:
        logger.info(f'[Community Chat] Removing SID {request.sid} from sid_to_user map.')
        try:
            del sid_to_user[request.sid]
            logger.info(f'[Community Chat] SID {request.sid} removed. Map size: {len(sid_to_user)}')
        except KeyError:
            logger.warning(f'[Community Chat] Attempted to remove SID {request.sid}, but it was already gone.')

def on_join(data):
    """
    处理客户端加入房间事件
    核心功能：将客户端添加到指定的聊天房间
    注意事项：
    1. 加入房间后通知房间内其他成员
    2. 向当前用户发送确认消息
    3. 详细的错误处理和日志记录
    """
    logger = current_app.logger
    try:
        username = data.get('username', 'Anonymous')
        room = data.get('room')
        if not room:
            logger.error('[Community Chat] 客户端尝试加入房间但未提供房间ID')
            return
            
        # 将客户端添加到指定房间
        join_room(room)
        logger.info(f'[Community Chat] 用户 {username} 加入房间: {room}, SID: {request.sid}')
        
        # 通知房间内其他成员有新用户加入（跳过当前用户）
        emit('status', {'msg': f'{username} 加入了讨论'}, room=room, skip_sid=request.sid)
        
        # 向当前用户发送确认消息
        emit('join_confirm', {'room': room, 'status': 'success'}, to=request.sid)
        
    except Exception as e:
        logger.error(f'[Community Chat] 处理用户加入房间时出错: {e}', exc_info=True)
        emit('error', {'message': f'加入房间失败: {str(e)}'}, to=request.sid)

def on_leave(data):
    """
    处理客户端离开房间事件
    核心功能：将客户端从指定房间移除
    注意事项：离开房间后通知房间内其他成员
    """
    logger = current_app.logger
    try:
        username = data.get('username', 'Anonymous')
        room = data.get('room')
        if not room:
            logger.warning(f'[Community Chat] Received leave event without room for SID: {request.sid}')
            return
        leave_room(room)
        logger.info(f'[Community Chat] 用户 {username} 离开房间: {room}, SID: {request.sid}')
        emit('status', {'msg': f'{username} 离开了讨论'}, room=room)
    except Exception as e:
        logger.error(f'[Community Chat] 处理用户离开房间时出错: {e}', exc_info=True)

def handle_send_message(data):
    """
    处理发送消息事件
    核心功能：保存消息并广播给房间内所有用户
    注意事项：
    1. 验证用户身份和权限
    2. 确保用户在正确的房间中 (支持 community_ 前缀)
    3. 保存消息到数据库
    4. 广播消息给所有用户(包括发送者)
    5. 处理@lynn指令，调用AI助手
    """
    logger = current_app.logger
    try:
        # --- 模型导入 (如果不在顶部) ---
        from app.models import User, ChatRoom, ChatMessage, Topic # 确保模型导入
        from app import db # 需要 db.session
        
        # --- 日志：检查 SID 和映射 --- 
        logger.info(f'[Auth SendMsg] Received message from SID: {request.sid}')
        if request.sid in sid_to_user:
            logger.info(f'[Auth SendMsg] SID {request.sid} found in sid_to_user map, User ID: {sid_to_user[request.sid]}')
        else:
            logger.warning(f'[Auth SendMsg] SID {request.sid} NOT found in sid_to_user map! Map content: {sid_to_user}')

        logger.info(f'[Community Chat] 收到消息: {data}, SID: {request.sid}')
        
        room = data.get('room')
        message_text = data.get('message')
        is_ai_mention = data.get('is_ai_mention', False)
        
        if not room or not message_text:
            logger.warning(f'[Community Chat] 接收到无效的消息数据: {data}')
            emit('error', {'message': '无效的消息数据'}, to=request.sid)
            return

        # --- 获取用户信息 (逻辑不变) ---
        user_id = None
        user = None
        if request.sid in sid_to_user:
            user_id = sid_to_user[request.sid]
            logger.info(f'[Community Chat] 从sid_to_user映射中找到用户ID: {user_id}')
        
        if user_id:
            user = User.query.get(user_id)
        
        if not user:
            logger.warning(f'[Auth SendMsg] Unauthorized: User not authenticated for SID={request.sid}.')
            emit('error', {'message': '未授权：请登录后发送消息'}, to=request.sid)
            return
            
        logger.info(f'[Auth SendMsg] User authenticated: ID={user.id}, Nickname={user.nickname} for SID={request.sid}')
            
        # --- 识别房间类型并获取或创建聊天室 ---
        topic_id = None
        chat_room = None

        # --- 解析带 _topic_ 的前缀 ---
        if room.startswith('community_topic_'):
            try:
                topic_id_str = room[16:] # 从 'community_topic_' 后面提取
                topic_id = int(topic_id_str)
                logger.info(f'[Community Chat] Identified room as Topic Chat: topic_id={topic_id}')
                topic = Topic.query.get(topic_id)
                if topic:
                    chat_room = ChatRoom.get_or_create(topic_id=topic_id)
                    if not chat_room: # 检查 get_or_create 的结果
                        logger.error(f'[Community Chat] Failed to get/create chat room for topic_id: {topic_id}, SID={request.sid}')
                        emit('error', {'message': '无法获取或创建聊天室 (主题)'}, to=request.sid)
                        return # 如果获取/创建失败，也需要返回
                else:
                    logger.error(f'[Community Chat] Topic not found for ID: {topic_id} in room name: {room}')
                    emit('error', {'message': '无效的房间标识 (未找到对应主题 ID)'}, to=request.sid)
                    return
            except ValueError:
                logger.error(f'[Community Chat] Invalid topic ID format in room name: {room}')
                emit('error', {'message': '无效的房间标识 (Topic ID 格式错误)'}, to=request.sid)
                return
            except Exception as e: # 添加通用异常捕获
                 logger.error(f'[Community Chat] Error processing topic room {room}: {e}', exc_info=True)
                 emit('error', {'message': f'处理主题房间时出错: {str(e)}'}, to=request.sid)
                 return
        else:
             logger.warning(f'[Community Chat] Invalid room format: {room} for SID={request.sid}')
             emit('error', {'message': '无效的房间标识'}, to=request.sid)
             return
            
        # 检查 chat_room 是否最终成功获取或创建
        if not chat_room:
            # 之前的逻辑已经处理了具体错误，这里理论上不应该执行到
            # 但作为保险，如果前面逻辑有误导致 chat_room 仍为 None，则记录并返回
            logger.error(f'[Community Chat] Reached end of room check but chat_room is still None for room: {room}, SID={request.sid}')
            emit('error', {'message': '无法确定聊天室'}, to=request.sid)
            return
        
        # --- 创建并保存消息 (逻辑不变) ---
        logger.info(f'[Community Chat] 准备保存消息: room_id={chat_room.id}, user_id={user.id}, content={message_text[:50]}...')
        chat_message = ChatMessage.add_message(
            chat_room_id=chat_room.id,
            content=message_text,
            user_id=user.id
        )
        
        if not chat_message:
            logger.error(f'[Community Chat] 保存消息失败 for SID={request.sid}')
            emit('error', {'message': '保存消息失败'}, to=request.sid)
            return
            
        # 将消息转换为前端所需格式并广播
        message_data = chat_message.to_realtime_format()
        logger.info(f'[Community Chat] 用户 {user.nickname} 在房间 {room} 发送消息: {message_text[:50]}...')
        
        # *** 确保 local_id 被添加到广播数据中 ***
        client_local_id = data.get('local_id')
        if client_local_id:
            message_data['local_id'] = client_local_id
            logger.info(f'[Community Chat] Adding local_id {client_local_id} to broadcast data.')
        else:
            logger.warning(f'[Community Chat] local_id not found in incoming data from SID {request.sid}')
            
        logger.info(f'[Community Chat] 广播消息 (含 local_id): {message_data}')
        
        emit('receive_message', message_data, room=room, include_self=True)
        logger.info(f'[Community Chat] 消息已广播至房间 {room}')
        
        # --- 处理@lynn指令 --- (现在使用 chat.py 中的函数)
        if is_ai_mention and '@lynn' in message_text.lower():
            try:
                logger.info(f'[Community Chat] 检测到@lynn指令，准备调用AI助手 for SID={request.sid}, room_id={chat_room.id}')
                
                recent_messages = ChatMessage.query.filter_by(chat_room_id=chat_room.id)\
                    .order_by(ChatMessage.created_at.desc())\
                    .limit(10).all()
                
                recent_messages.reverse()
                
                context_messages = []
                for msg in recent_messages:
                    role = "assistant" if msg.is_system_message else "user"
                    # 使用 nickname 或 email 作为发送者标识
                    sender_identifier = msg.user.nickname if msg.user and msg.user.nickname else (msg.user.email if msg.user else "匿名用户")
                    sender = "Lynn" if msg.is_system_message else sender_identifier
                    context_messages.append({
                        "role": role,
                        "content": f"{sender}: {msg.content}"
                    })
                
                user_prompt_text = message_text.replace('@lynn', '').strip()
                
                # --- 修改: 从 app.routes.chat 导入并调用 ---
                try:
                    from app.routes.chat import generate_response_with_context
                except ImportError:
                    logger.error("[Community Chat] Failed to import generate_response_with_context from app.routes.chat", exc_info=True)
                    emit('error', {'message': 'AI 功能暂时无法使用 (导入错误)'}, to=request.sid)
                    return
                
                # --- 定义社区聊天的特定系统提示 ---
                # 获取主题名称
                topic_name = chat_room.topic.name if chat_room.topic else "未知社区"
                community_system_prompt = f"""你是 Lynn，一个由 SynSpirit 公司开发的 AI 助手。
用户 "{user.nickname or user.email}" 在社区聊天室 "{topic_name}" 中 @ 你并说了：'{user_prompt_text}'。
请根据以下最近的对话上下文直接回应用户。

重要：
- **绝对不要**在你的回答中重复用户刚刚说的内容或问题，直接给出你的想法或回应。
- 保持友好活泼，可以适当使用 emoji。
"""
                
                logger.info(f"[AI Call Community] Calling generate_response_with_context...")
                ai_message_content = generate_response_with_context(
                    user_message=user_prompt_text,
                    context_messages=context_messages,
                    system_prompt=community_system_prompt
                )
                # --- 结束修改 ---

                if ai_message_content and not ai_message_content.startswith("抱歉"):
                    logger.info(f"[AI Call Community] Received AI response: {ai_message_content[:100]}...")
                    # 保存 AI 回复到数据库
                    ai_chat_message = ChatMessage.add_message(
                        chat_room_id=chat_room.id,
                        content=ai_message_content,
                        user_id=None, # 系统消息
                        is_system_message=True 
                    )
                    
                    if ai_chat_message:
                        ai_message_data = ai_chat_message.to_realtime_format()
                        emit('receive_message', ai_message_data, room=room)
                        logger.info(f"[AI Call Community] AI response broadcasted to room {room}.")
                    else:
                         logger.error(f"[AI Call Community] Failed to save AI response message for room {room}.")
                elif ai_message_content:
                     # 如果 AI 返回错误消息，也发送给用户
                     logger.warning(f"[AI Call Community] AI returned an error message: {ai_message_content}")
                     emit('error', {'message': ai_message_content}, to=request.sid) 
                else:
                    logger.error("[AI Call Community] AI response was empty or null.")
                    emit('error', {'message': 'AI助手未能生成有效回复'}, to=request.sid) 
                    
            except Exception as ai_err:
                logger.error(f'[Community Chat] 处理 @lynn 指令时出错: {ai_err}', exc_info=True)
                # 将更具体的错误信息发送给前端
                emit('error', {'message': f'处理AI请求时发生内部错误: {str(ai_err)}'}, to=request.sid)

    except Exception as e:
        logger.error(f'[Community Chat] 处理发送消息时出错: {e}', exc_info=True)
        # 返回错误信息给发送者
        emit('error', {'message': f'发送消息失败: {str(e)}'}, to=request.sid)

def handle_request_history(data):
    """
    处理客户端请求历史消息事件
    核心功能：根据房间名查找对应的聊天室并返回指定消息之前的历史消息记录 (基于ID分页)
    注意事项：
    1. 支持 community_ 前缀的房间名
    2. 使用 before_message_id 进行分页
    3. 返回 has_more 标志告知客户端是否还有更多历史
    """
    logger = current_app.logger
    try:
        from app.models import ChatRoom, ChatMessage, Topic # 确保模型导入
        from app import db # 需要 db

        room_name = data.get('room')
        # 从前端获取 limit 和 before_message_id
        limit = data.get('limit', 30) 
        before_message_id_str = data.get('before_message_id')

        if not room_name:
            logger.warning('[Community Chat] History request missing room name')
            emit('error', {'message': '未指定房间'}, to=request.sid)
            return

        logger.info(f'[Community Chat History] Request for room: {room_name}, limit: {limit}, before_id: {before_message_id_str}')

        chat_room = None
        # --- 房间识别逻辑 (保持不变) ---
        if room_name.startswith('community_topic_'):
            try:
                topic_id_str = room_name[16:]
                topic_id = int(topic_id_str)
                # logger.info(f'[Community Chat History] Identified room as Topic Chat: topic_id={topic_id}')
                topic = Topic.query.get(topic_id)
                if topic:
                    # 优化：直接通过 topic_id 查询 ChatRoom
                    chat_room = ChatRoom.query.filter_by(topic_id=topic.id).first() 
                else:
                    logger.warning(f'[Community Chat History] Topic not found for ID: {topic_id}. Returning empty history.')
            except ValueError:
                 logger.error(f'[Community Chat History] Invalid topic ID format in room name: {room_name}')
                 emit('error', {'message': '无效的房间标识 (Topic ID 格式错误)'}, to=request.sid)
                 return
            except Exception as e:
                 logger.error(f'[Community Chat History] Error finding topic room {room_name}: {e}', exc_info=True)
                 emit('error', {'message': f'查找主题房间时出错: {str(e)}'}, to=request.sid)
                 return
        else:
            logger.warning(f'[Community Chat History] Invalid room format: {room_name} for SID={request.sid}')
            emit('error', {'message': '无效的房间标识'}, to=request.sid)
            return
            
        history_data = []
        has_more = False

        if chat_room:
            # 构建基础查询
            query = db.session.query(ChatMessage).filter(ChatMessage.chat_room_id == chat_room.id)
            
            # 如果提供了 before_message_id，则添加 ID 过滤条件
            if before_message_id_str:
                try:
                    before_message_id = int(before_message_id_str)
                    query = query.filter(ChatMessage.id < before_message_id)
                except ValueError:
                    logger.warning(f'[Community Chat History] Invalid before_message_id format: {before_message_id_str}. Fetching latest history segment.')
                    # 如果 ID 格式无效，可以选择返回错误或获取最新一批
                    # 此处选择获取最新一批 (不加 ID 过滤)

            # 查询 limit + 1 条来判断是否还有更多
            # 按 ID 降序排列 (ID 越小越旧)
            messages_page = query.order_by(ChatMessage.id.desc()).limit(limit + 1).all()
            
            if len(messages_page) > limit:
                has_more = True
                # 取前 limit 条 (ID 较大的，即相对较新的)
                history_messages = messages_page[:-1] 
            else:
                has_more = False
                history_messages = messages_page
            
            # *** 重要：反转列表 ***
            # 因为我们是按 ID 降序获取的 (新 -> 旧)
            # 但前端期望将获取到的历史记录追加到现有消息 *之前*
            # 所以需要将这批消息反转为按 ID 升序 (旧 -> 新)
            history_messages.reverse() 
            
            history_data = [msg.to_realtime_format() for msg in history_messages]
            logger.info(f'[Community Chat History] Room ID: {chat_room.id}. Returning {len(history_data)} messages. Has more: {has_more}. Before ID: {before_message_id_str}')
        else:
            logger.info(f'[Community Chat History] Chat room not found for room {room_name}. Returning empty history.')
            # history_data 保持为空
            # has_more 保持为 False

        # 发送历史消息给请求的客户端，包含 has_more 和请求的游标 ID
        emit('message_history', {
            'history': history_data,
            'has_more': has_more,
            'requested_before_id': before_message_id_str # 将请求的 ID 传回，方便前端对应
        }, to=request.sid)

    except Exception as e:
        logger.error(f'[Community Chat] 处理历史消息请求时出错: {e}', exc_info=True)
        emit('error', {'message': f'获取历史消息失败: {str(e)}'}, to=request.sid)


# --- 注册函数 ---

def register_community_chat_handlers(socketio):
    """将此模块中的事件处理器注册到 SocketIO 实例上"""
    # 使用从外部传入的 socketio 实例注册事件
    @socketio.on('disconnect')
    def disconnect_handler():
        handle_disconnect()

    @socketio.on('join')
    def join_handler(data):
        on_join(data)

    @socketio.on('leave')
    def leave_handler(data):
        on_leave(data)

    @socketio.on('send_message')
    def send_message_handler(data):
        handle_send_message(data)

    @socketio.on('request_history')
    def request_history_handler(data):
        handle_request_history(data)

# --- 结束 --- 