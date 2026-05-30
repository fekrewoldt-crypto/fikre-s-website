// News DAO using Supabase.
// Persists health news items with upsert, retrieval, and cleanup operations.

'use strict';

require('dotenv').config();
const supabase = require('./supabase');

/**
 * Upsert an array of news items. Existing items (by url) are updated.
 * @param {Array<{
 *   title: string,
 *   description: string,
 *   url: string,
 *   source: string,
 *   category: string,
 *   published_at: string,
 *   is_AI_generated?: boolean,
 *   is_curated?: boolean,
 *   icon?: string,
 *   tag?: string,
 *   tagName?: string
 * }>} newsItems
 * @returns {Promise<void>}
 */
async function saveNews(newsItems) {
  if (!newsItems || newsItems.length === 0) return;

  if (process.env.NODE_ENV === 'test') return; // no-op in test mode

  const rows = newsItems.map(item => ({
    title: item.title || '',
    description: item.description || item.body || '',
    url: item.url || `https://mediscan.news/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: item.source || 'MediScan',
    category: item.category || 'general',
    published_at: item.published_at || new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    is_AI_generated: item.is_AI_generated ?? true,
    is_curated: item.is_curated ?? false,
    // Preserve icon/tag fields for the frontend response
    icon: item.icon || null,
    tag: item.tag || null,
    tagName: item.tagName || null,
    date: item.date || null,
    body: item.body || item.description || item.title || '',
  }));

  // Use upsert with url as the unique key
  const { error } = await supabase
    .from('news')
    .upsert(rows, { onConflict: 'url', ignoreDuplicates: false });

  if (error) throw error;
}

/**
 * Fetch the latest news items, newest first.
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function getNews(limit = 20) {
  if (process.env.NODE_ENV === 'test') return []; // no-op in test mode

  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Fetch news items filtered by category.
 * @param {string} category
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function getNewsByCategory(category, limit = 20) {
  if (process.env.NODE_ENV === 'test') return [];

  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('category', category)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Delete news items older than N days.
 * @param {number} [daysOld=7]
 * @returns {Promise<number>} Number of deleted rows
 */
async function deleteOldNews(daysOld = 7) {
  if (process.env.NODE_ENV === 'test') return 0; // no-op in test mode

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const { data, error, count } = await supabase
    .from('news')
    .delete()
    .lt('fetched_at', cutoff.toISOString())
    .select('id', { count: 'exact' });

  if (error) throw error;
  return count || (data ? data.length : 0);
}

/**
 * Check if the database has fresh news (fetched within the last N minutes).
 * @param {number} [maxAgeMinutes=60]
 * @returns {Promise<boolean>}
 */
async function hasFreshNews(maxAgeMinutes = 60) {
  if (process.env.NODE_ENV === 'test') return false;

  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - maxAgeMinutes);

  const { data, error } = await supabase
    .from('news')
    .select('id')
    .gte('fetched_at', cutoff.toISOString())
    .limit(1);

  if (error) throw error;
  return (data && data.length > 0) || false;
}

module.exports = { saveNews, getNews, getNewsByCategory, deleteOldNews, hasFreshNews };