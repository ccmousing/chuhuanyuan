/**
 * 本地存储封装
 *
 * 为什么要多这一层：
 *   1. wx.setStorageSync 在存储空间满、或被系统禁用时会**直接抛异常**，
 *      裸调用会让整个页面逻辑中断。这里统一 try/catch，失败只丢数据、不崩页面。
 *   2. key 带版本号（chy_v1）。以后改数据结构只升版本号，旧数据自动作废，
 *      不会因为读到旧结构而白屏。
 *   3. 所有读操作都有默认值兜底，页面不需要写判空。
 *
 * 注意：这是**本机数据**，换设备或清缓存即丢。要跨设备同步必须接后端。
 */

const KEY = 'chy_v1';

function read() {
  try {
    const d = wx.getStorageSync(KEY);
    return (d && typeof d === 'object') ? d : {};
  } catch (e) {
    console.warn('[store] 读取失败，按空数据处理', e);
    return {};
  }
}

function write(d) {
  try {
    wx.setStorageSync(KEY, d);
    return true;
  } catch (e) {
    console.warn('[store] 写入失败（存储可能已满）', e);
    return false;
  }
}

function get(k, def) {
  const d = read();
  return d[k] === undefined ? def : d[k];
}

function set(k, v) {
  const d = read();
  d[k] = v;
  return write(d);
}

/* ---------------- 仪式进度 ---------------- */
// step = 已到达的步骤下标，-1 表示还没开始
function getRitualStep() { return get('ritualStep', -1); }
function setRitualStep(i) { return set('ritualStep', i); }
/** 归零：回到「还没开始」，进度显示 0/7 */
function resetRitual() { return set('ritualStep', -1); }
/** 走过的步骤数（用于「我的花园」显示 7/7） */
function getRitualReached() {
  const s = getRitualStep();
  return s < 0 ? 0 : s + 1;
}
function isRitualDone() { return getRitualStep() >= 6; }

/* ---------------- 答题记录 ---------------- */
function getQuiz() {
  const q = get('quiz', { answered: 0, right: 0 });
  return { answered: q.answered || 0, right: q.right || 0 };
}
function addQuizAnswer(right) {
  const q = getQuiz();
  q.answered += 1;
  if (right) q.right += 1;
  set('quiz', q);
  return q;
}
function resetQuiz() { return set('quiz', { answered: 0, right: 0 }); }

/* ---------------- 收藏 ---------------- */
function getFavorites() {
  const f = get('favorites', []);
  return Array.isArray(f) ? f : [];
}
function isFavorite(id) { return getFavorites().indexOf(id) > -1; }
/** @returns {boolean} 操作后是否处于「已收藏」状态 */
function toggleFavorite(id) {
  const f = getFavorites();
  const i = f.indexOf(id);
  if (i > -1) { f.splice(i, 1); set('favorites', f); return false; }
  f.push(id);
  set('favorites', f);
  return true;
}

/* ---------------- 徽章 ---------------- */
function getBadges() {
  const b = get('badges', []);
  return Array.isArray(b) ? b : [];
}
function hasBadge(id) { return getBadges().indexOf(id) > -1; }
/** @returns {boolean} 是否是本次新解锁（用于决定要不要弹提示） */
function unlockBadge(id) {
  if (hasBadge(id)) return false;
  const b = getBadges();
  b.push(id);
  set('badges', b);
  return true;
}

/* ---------------- 阅读记录 ---------------- */
function isArticleRead(id) {
  const r = get('readIds', []);
  return Array.isArray(r) && r.indexOf(id) > -1;
}
/** @returns {number} 累计读过的文章数 */
function markArticleRead(id) {
  const r = get('readIds', []);
  const arr = Array.isArray(r) ? r : [];
  if (arr.indexOf(id) === -1) { arr.push(id); set('readIds', arr); }
  return arr.length;
}
function getReadCount() {
  const r = get('readIds', []);
  return Array.isArray(r) ? r.length : 0;
}

/* ---------------- 本机埋点（B7） ----------------
   只在本机累计，不联网。三个概念要分开，混在一起两头都不好用：
     readCounts  —— 每篇文章被读了几次（只增，用于看「哪篇更受欢迎」）
     wrongCounts —— 每道题错了几次（只增，用于看「哪题最难」）
     wrongSet    —— 当前还没订正的错题 id（答对即移除，用于「错题重练」）
   前两个是统计，第三个是待办清单。                                          */

function getReadCounts() {
  const m = get('readCounts', {});
  return (m && typeof m === 'object') ? m : {};
}
/** 记一次阅读，返回累计次数 */
function bumpRead(id) {
  const m = getReadCounts();
  m[id] = (m[id] || 0) + 1;
  set('readCounts', m);
  return m[id];
}
/** 某篇读了几次（没有记录返回 0） */
function readTimes(id) { return getReadCounts()[id] || 0; }

function getWrongCounts() {
  const m = get('wrongCounts', {});
  return (m && typeof m === 'object') ? m : {};
}
/** 记一次答错，并加入「待订正」集合；返回该题累计错误次数 */
function bumpWrong(qid) {
  const m = getWrongCounts();
  const k = String(qid);
  m[k] = (m[k] || 0) + 1;
  set('wrongCounts', m);

  const arr = getWrongSet();
  if (arr.indexOf(qid) === -1) { arr.push(qid); set('wrongSet', arr); }
  return m[k];
}
/** 订正：从「待订正」里移除。wrongCounts 保留，统计不受影响 */
function resolveWrong(qid) {
  const arr = getWrongSet();
  const i = arr.indexOf(qid);
  if (i === -1) return false;
  arr.splice(i, 1);
  set('wrongSet', arr);
  return true;
}
/** 当前待订正的错题 id 列表 */
function getWrongSet() {
  const arr = get('wrongSet', []);
  return Array.isArray(arr) ? arr : [];
}
/** 某题累计错了几次 */
function wrongTimes(qid) { return getWrongCounts()[String(qid)] || 0; }

/* ---------------- 祝福卡 ---------------- */
function getCardCount() { return get('cardCount', 0); }
function addCard() {
  const n = getCardCount() + 1;
  set('cardCount', n);
  return n;
}

/* ---------------- 个人资料 ---------------- */
/**
 * 只存用户自己填的昵称与年份。
 * 刻意不收集：手机号、真实姓名、出生日期、位置 —— 未成年人数据按最小化原则处理。
 */
function getProfile() {
  const p = get('profile', {});
  return { nick: (p && p.nick) || '', year: (p && p.year) || '' };
}
function setProfile(patch) {
  const cur = getProfile();
  const next = { nick: cur.nick, year: cur.year };
  if (patch && typeof patch.nick === 'string') next.nick = patch.nick;
  if (patch && typeof patch.year === 'string') next.year = patch.year;
  set('profile', next);
  return next;
}

/* ---------------- 清除 ---------------- */
/** 一键清除全部本机数据（隐私合规要求，方案第七章有写） */
function clearAll() {
  try {
    wx.removeStorageSync(KEY);
    return true;
  } catch (e) {
    console.warn('[store] 清除失败', e);
    return false;
  }
}

module.exports = {
  getRitualStep: getRitualStep,
  setRitualStep: setRitualStep,
  resetRitual: resetRitual,
  getRitualReached: getRitualReached,
  isRitualDone: isRitualDone,
  getQuiz: getQuiz,
  addQuizAnswer: addQuizAnswer,
  resetQuiz: resetQuiz,
  getFavorites: getFavorites,
  isFavorite: isFavorite,
  toggleFavorite: toggleFavorite,
  getBadges: getBadges,
  hasBadge: hasBadge,
  unlockBadge: unlockBadge,
  isArticleRead: isArticleRead,
  markArticleRead: markArticleRead,
  getReadCount: getReadCount,
  getReadCounts: getReadCounts,
  bumpRead: bumpRead,
  readTimes: readTimes,
  getWrongCounts: getWrongCounts,
  bumpWrong: bumpWrong,
  resolveWrong: resolveWrong,
  getWrongSet: getWrongSet,
  wrongTimes: wrongTimes,
  getCardCount: getCardCount,
  addCard: addCard,
  getProfile: getProfile,
  setProfile: setProfile,
  clearAll: clearAll
};
