/**
 * 每日民俗一签
 *
 * 为什么单独抽一个模块：原来的「今日一签」文案是硬编码在 index.wxml 里的，
 * 每天都是同一句 —— 名字叫"今日"，实际从不变化，属于文案承诺了不存在的东西。
 *
 * 这里的做法是**按本地日期轮换**：7 条内容，每天换一条，第 8 天回到第 1 条。
 * 所有内容都取自 utils/content.js 里已核实过的正文，不新增未核实细节。
 *
 * articleId 必须是 content.js 里真实存在的文章 id —— 写错会导致点击跳空，
 * tools/check-copy.js 会校验这一点。
 */

const SIGNS = [
  {
    quote: '「咬鸡头，富雅贤；咬鸡嘴，大富贵。」',
    text: '出花园宴上最热闹的一环。相传源于明嘉靖潮州状元林大钦，父亲以鸡头奖励他，寄望「独占鳌头」，后来果然高中。',
    articleId: 'head-dish',
    more: '看头彩食十二碗怎么摆'
  },
  {
    quote: '一双会响的鞋，走的是「出花园」这一步。',
    text: '出花园当天要穿红皮木屐。红是喜庆辟邪，木屐作响寓意堂堂正正。这个习俗也常被追溯到林大钦少时穿木屐读书的传说。',
    articleId: 'why-clogs',
    more: '红木屐的由来'
  },
  {
    quote: '十二种花草煮一盆水，洗去的是稚气。',
    text: '常用石榴花、芙蓉花、春草、状元竹等。「十二」应合一年十二月与十二生肖，取圆满之意——但具体名目各乡各家并不统一。',
    articleId: 'twelve-flowers',
    more: '十二花水到底是哪十二种'
  },
  {
    quote: '十五岁之前，潮汕孩子都「住在花园里」。',
    text: '民间说孩子受「公婆母」（也叫花公花妈）庇佑。出花园这天拜谢神恩，就是告诉神明：孩子今日要跨出花园墙了。',
    articleId: 'gongpopo',
    more: '公婆母是谁'
  },
  {
    quote: '猪肚换肠肚，芹菜勤劳，豆干做官。',
    text: '十二碗「花园菜」每样都要吃一点，全靠谐音讨彩头：葱是聪明，蒜是会算盘，韭菜取长长久久。',
    articleId: 'head-dish',
    more: '每碗都有什么彩头'
  },
  {
    quote: '出了花园，当天反而不出门。',
    text: '仪式当天要静守家中，不外出、不串门，叫「躲花园」，寓意收心立志。也有地方说「行巷」，取行四方、处处有得食之意。',
    articleId: 'what-is',
    more: '出花园当天要做什么'
  },
  {
    quote: '同一项礼俗，三种当代活法。',
    text: '汕头偏规模化集体传承，潮州突出侨乡与歌册「做四句」，揭阳侧重学宫文明实践。三地同源共传，做法各有侧重，没有高下。',
    articleId: 'three-cities',
    more: '汕潮揭三地怎么办'
  }
];

/**
 * 取本地日期的"天序号"。
 * 用 Date.UTC 把本地的年月日重新组装成时间戳，避免时区偏移导致跨天错位
 * （直接 Date.now()/86400000 是按 UTC 日界算的，东八区会在早上 8 点换签）。
 */
function dayIndex(date) {
  const d = date || new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** 取某天的一签；不传日期则取今天 */
function signOfDay(date) {
  const i = dayIndex(date) % SIGNS.length;
  return SIGNS[(i + SIGNS.length) % SIGNS.length];
}

module.exports = { SIGNS: SIGNS, signOfDay: signOfDay };
