/**
 * 搜索路由定义
 * 处理所有搜索相关的API路由
 */

const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

// 获取与查询相似的内容
router.get('/similar', searchController.findSimilarContent);

module.exports = router; 