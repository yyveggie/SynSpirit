/**
 * @file useToolsQueries.ts
 * @description 自定义 Hooks，用于封装工具页面 (ToolsPage) 的数据获取和缓存逻辑。
 *              使用 TanStack Query (useQuery) 管理工具列表、分类和标签数据。
 */
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

// --- 类型定义 ---
// Tool 类型 (与 ToolsPage.tsx 中保持一致或从共享类型文件导入)
export interface Tool {
    id: number;
    name: string;
    description: string;
    slug: string;
    screenshot_url?: string | null;
    source_url?: string | null;
    category?: { id: number; name: string };
    tags?: string[];
}

// Category 类型
export interface Category {
    id: number;
    name: string;
}

// --- 新增: ToolDetail 类型定义 ---
// (与 ToolDetailPage.tsx 中保持一致)
export interface ToolDetail {
  id: number;
  name: string;
  description: string;
  slug: string;
  content?: string | null;
  screenshot_url?: string | null;
  source_url?: string | null;
  category?: { id: number; name: string };
  tags?: string[];
  is_free?: boolean;
  features?: string[];
  use_cases?: string[];
  pros?: string[];
  cons?: string[];
  pricing_info?: any; // Adjust type if needed
  installation_steps?: string | null;
  created_at: string;
  updated_at: string;
}

// --- API 获取函数 ---

// 获取分类列表
const fetchCategories = async (): Promise<Category[]> => {
    console.log("[fetchCategories] Fetching categories...");
    const response = await axios.get<Category[]>(`${API_BASE_URL}/api/categories/`);
    // 添加数据校验
    if (!Array.isArray(response.data)) {
        console.error("Invalid categories data format:", response.data);
        throw new Error("无法获取分类列表，数据格式错误。");
    }
    return response.data;
};

// 获取所有标签
const fetchTags = async (): Promise<string[]> => {
    console.log("[fetchTags] Fetching all tags...");
    const response = await axios.get<{ tags: string[] }>(`${API_BASE_URL}/api/tools/tags`);
     // 添加数据校验
    if (!response.data || !Array.isArray(response.data.tags)) {
        console.error("Invalid tags data format:", response.data);
        throw new Error("无法获取标签列表，数据格式错误。");
    }
    return response.data.tags;
};

// 获取工具列表（支持筛选）
const fetchTools = async (categoryId: number | 'all', tag: string | 'all'): Promise<Tool[]> => {
    console.log(`[fetchTools] Fetching tools with category: ${categoryId}, tag: ${tag}...`);
    let toolsUrl = `${API_BASE_URL}/api/tools/?`;

    // --- 优先使用标签筛选 ---
    if (tag !== 'all') {
        toolsUrl += `tag=${encodeURIComponent(tag)}&`;
    } else if (categoryId !== 'all') { // 否则使用分类筛选
        toolsUrl += `category_id=${categoryId}&`;
    }
    // --- 结束修改 ---

    // 按创建时间降序排序
    toolsUrl += `sort_by=created_at&sort_order=desc`;

    // 添加 Cache-Control headers 可能不是最佳实践，因为 TanStack Query 会处理缓存
    // 如果确实需要绕过浏览器缓存，可以添加时间戳
    // toolsUrl += `&_=${new Date().getTime()}`;

    const response = await axios.get<{ tools: Tool[]; total: number }>(toolsUrl);
    // 添加数据校验
    if (!response.data || !Array.isArray(response.data.tools)) {
        console.error("Invalid tools data format:", response.data);
        throw new Error("无法获取工具列表，数据格式错误。");
    }
    return response.data.tools;
};

// --- 新增: API 获取函数 for Tool Detail ---
const fetchToolDetailBySlug = async (slug: string): Promise<ToolDetail> => {
    // 添加 slug 检查，虽然 useQuery 的 enabled 也会处理
    if (!slug) {
        throw new Error("Tool slug is required.");
    }
    console.log(`[fetchToolDetailBySlug] Fetching tool detail for slug: ${slug}...`);
    const response = await axios.get<ToolDetail>(`${API_BASE_URL}/api/tools/slug/${slug}`);
    // 基本的数据校验
    if (!response.data || typeof response.data.id !== 'number') {
        console.error("Invalid tool detail data format:", response.data);
        // 考虑根据状态码抛出特定错误，例如 404
        throw new Error("无法获取工具详情，数据格式错误。");
    }
    return response.data;
};

// --- 自定义 Hooks ---

/**
 * Hook: useCategories
 * 获取并缓存分类列表。
 * 数据被视为长时间有效 (staleTime: Infinity)，因为分类不常变动。
 */
export const useCategories = () => {
    return useQuery<Category[], Error>({
        queryKey: ['categories'], // 缓存键
        queryFn: fetchCategories, // 获取数据的函数
        staleTime: Infinity, // 数据永不过期，除非手动 invalidate
        gcTime: Infinity, // 缓存永不回收，除非手动 invalidate
        refetchOnWindowFocus: false, // 窗口聚焦时不重新获取
    });
};

/**
 * Hook: useTags
 * 获取并缓存所有可用标签的列表。
 * 数据被视为长时间有效 (staleTime: 1 小时)。
 */
export const useTags = () => {
    return useQuery<string[], Error>({
        queryKey: ['tags'],
        queryFn: fetchTags,
        staleTime: 1000 * 60 * 60, // 1 小时内数据新鲜
        gcTime: 1000 * 60 * 60 * 2, // 2 小时不活跃后回收
        refetchOnWindowFocus: false,
    });
};

/**
 * Hook: useTools
 * 获取并缓存工具列表，根据选定的分类和标签进行筛选。
 * 当 categoryId 或 tag 变化时，会自动重新获取数据。
 * 
 * @param {number | 'all'} categoryId 选中的分类 ID 或 'all'
 * @param {string | 'all'} tag 选中的标签或 'all'
 */
export const useTools = (categoryId: number | 'all', tag: string | 'all') => {
    return useQuery<Tool[], Error>({
        // queryKey 包含筛选条件，当它们变化时，查询会自动更新
        queryKey: ['tools', { category: categoryId, tag: tag }], 
        queryFn: () => fetchTools(categoryId, tag),
        // 可以设置 staleTime 和 gcTime，例如 5 分钟
        staleTime: 1000 * 60 * 5, // 5 分钟
        gcTime: 1000 * 60 * 10, // 10 分钟
        refetchOnWindowFocus: true, // 窗口聚焦时重新获取（可选）
    });
};

// --- 新增: 自定义 Hook for Tool Detail ---

/**
 * Hook: useToolDetail
 * 获取并缓存单个工具的详细信息。
 * 当 slug 变化时，会自动重新获取数据。
 * 
 * @param {string | undefined} slug 工具的 slug
 */
export const useToolDetail = (slug: string | undefined) => {
    return useQuery<ToolDetail, Error>({
        // queryKey 包含 slug，确保每个工具详情都有独立的缓存
        queryKey: ['toolDetail', slug], 
        // 只有当 slug 存在时才执行查询
        queryFn: () => fetchToolDetailBySlug(slug!), // 使用 non-null assertion 因为 enabled 确保了 slug 存在
        enabled: !!slug, // 关键：只有当 slug 有效（非 null/undefined/空字符串）时才触发查询
        staleTime: 1000 * 60 * 10, // 10 分钟内数据新鲜
        gcTime: 1000 * 60 * 30, // 30 分钟不活跃后回收
        refetchOnWindowFocus: false, // 窗口聚焦时不重新获取详情（通常不需要）
    });
}; 