/**
 * 妙趣横生的僵尸调整 — 运行期入口
 * Copyright (c) 2026 YG — MIT License（完整条款见仓库根 LICENSE，素材与引用声明见 NOTICE.md）
 *
 * 十条需求里，小鬼血量是数据（jsons/objects/ZombieProps.json），其余九条在这里。
 *
 * ── 引擎事实（对 0.15.0 的 assets/main/index.js 逐段核对所得）──
 *  2. 重金属巨人：基类 GargantuarZombie 的 onSmashing 是空函数，砸植物走 _smash()（SmashDamage）；
 *     八十年代表演世界覆写 onSmashing = 放音效 + shootOnePea(WaveType='eighties_gargantuar_wave')。
 *     那颗波投射物在 ProjectileProps 里 Damage=1000 —— 这就是它的 AOE。
 *     ⇒ 拦掉 onSmashing 即可去掉 AOE，普通砸击（1500）分毫不动。
 *  3. 街机：EightiesArcadeCabinet（游戏机本体，挂在墓碑/道具池里）的召唤在 specialTombUpdate 里：
 *       this.summonCD -= dt; this.summonCD <= 0 && (this.summonCD = getRandom(SummonInterval); SpawnZombieByZombieType(...))
 *     默认池 SummonnedZombies = [60% eighties_8bit, 30% eighties_8bit_armor1, 10% eighties_8bit_armor2]。
 *     ⇒ 把 armor2 从实例的池子里摘掉 + 召唤发生时自扣血。
 *  4. 地刺：引擎给僵尸的 whenStabbedBySpikeWeed(spikeweeds) 钩子，载具类（钢琴、弹射器、滚桶、雪橇）
 *     都是「this.playDie() + 让地刺 normalSmash(this)」这一套。闪耀僵尸没覆写，所以照抄这套即可。
 *  5. 霹雳舞：kick() 里对 1.5 格矩形内**所有**可踢僵尸 forEach 做 leapBy。
 *     ⇒ 换成「只挑一只」，踢到一只后自己掉 50 血。
 *  6. 麦克说唱家：甩麦走 specialAnimationListener 的 "attack" 事件 → attack()（JamAttackDamage=2001）。
 *     ⇒ 在 attack 之后把自己打死。
 *  8. 章鱼：投掷在 specialAnimationListener 的 "throw" 事件 → _throw()。
 *     ⇒ _throw 之后自扣 150。
 *  9. 弄臣：specialZombieUpdate 里维护 rotating 状态。
 *     ⇒ rotating 期间按秒持续掉血。
 */
const CFG = {
  arcadeSummonSelfHit: 100, // 街机柜每召唤一次小怪，自己掉多少血（需求未给数值，这里取 100）
  breakdancerKickSelfHit: 50, // 霹雳舞每踢一次自扣（需求指定 50）
  octopusThrowSelfHit: 150, // 章鱼每扔一次自扣（需求指定 150）
  jesterRotateSelfHitPerSec: 20, // 弄臣旋转时每秒掉血
  pixelZombieSelfHitPerSec: 10, // 6. 像素僵尸每秒自扣（无视防具）
  kingGuardianImpType: 12, // 10. 拦截国王用的「隐形小鬼」类型（ZombieEnum.imp = 12）
  kingGuardianSpawnStyle: 0, // 10. 生成风格（LnCSpawnZombieStyleEnum.appear = 0）
  kingGuardianOpacity: 0.35, // 10. 隐形程度（0 = 全透明，1 = 正常）
  selfKillDamage: 999999, // 「自杀」用的致死伤害
}

/** 像素僵尸的 ID —— 取自 Zombies.ts 的 ZombieEnum（eighties_8bit = 334） */
const PIXEL_ZOMBIE_ID = 334

/**
 * 免疫冰系的僵尸 ID（同样取自 ZombieEnum）：
 *   228 = iceage_weasel（冰鼬）
 *   229 = iceage_imp（雪人小鬼）
 * 需求里写作「冰河小鬼（冰鼬）」，而数据里这是**两只不同的僵尸**，
 * 因此两只一并免疫。
 */
const ICE_IMMUNE_IDS = [228, 229]

/** 每个类：定位名候选 + 模块路径 + 要包的方法 + 行为模式 */
const TARGETS = [
  { key: 'gargantuarAoe', label: '重金属巨人·舞台效果改为扔小鬼', names: ['EightiesGargantuarZombie'], module: 'chunks:///_virtual/EightiesGargantuarZombie.ts', methods: ['onSmashing'], mode: 'jamThrow' },
  { key: 'arcadeSummon', label: '街机游戏机·召唤自扣血+禁铁桶', names: ['EightiesArcadeCabinet'], module: 'chunks:///_virtual/EightiesArcadeCabinet.ts', methods: ['specialTombUpdate'], mode: 'arcade' },
  { key: 'glitterSpike', label: '轮滑（闪耀）·地刺秒杀', names: ['EightiesGlitterZombie', 'EightiesGlitterZombieZombie'], module: 'chunks:///_virtual/EightiesGlitterZombie.ts', methods: ['whenStabbedBySpikeWeed'], mode: 'spike' },
  { key: 'breakdancerKick', label: '霹雳舞·一次只踢一只+自扣50', names: ['EightiesBreakDancerZombie', 'EightiesBreakDancerZombieZombie'], module: 'chunks:///_virtual/EightiesBreakDancerZombie.ts', methods: ['kick'], mode: 'kick' },
  { key: 'mcSelfKill', label: '麦克说唱家·甩完麦自杀', names: ['EightiesMCZombie'], module: 'chunks:///_virtual/EightiesMCZombie.ts', methods: ['attack'], mode: 'selfHitAfter', hit: 'selfKillDamage' },
  { key: 'octopusSelfHit', label: '章鱼僵尸·投掷自扣150', names: ['BeachOctopusZombie'], module: 'chunks:///_virtual/BeachOctopusZombie.ts', methods: ['_throw'], mode: 'selfHitAfter', hit: 'octopusThrowSelfHit' },
  { key: 'jesterRotate', label: '弄臣·旋转持续掉血', names: ['DarkJesterZombie'], module: 'chunks:///_virtual/DarkJesterZombie.ts', methods: ['specialZombieUpdate'], mode: 'rotate' },
  // ── 1. 脉冲黄桃：瘫痪并强制落地所有飞机（僵王除外）──
  // 基类 Zombie.empStun 是空函数，全引擎只有 12 处覆写，飞行僵尸里仅无人机有份。
  // 这里把五类飞机全部补上覆盖，落地靠 flying=false 触发 onLanding()。
  { key: 'empSky', label: '脉冲黄桃·小鬼飞机', names: ['SkyImpZombie'], module: 'chunks:///_virtual/SkyImpZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·单体战斗机', names: ['SkyBattlePlaneZombie'], module: 'chunks:///_virtual/SkyBattlePlaneZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·双体战斗机(上)', names: ['SkyTwinUpperZombie'], module: 'chunks:///_virtual/SkyTwinUpperZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·双体战斗机(下)', names: ['SkyTwinLowerZombie'], module: 'chunks:///_virtual/SkyTwinLowerZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·无人机', names: ['SkyDroneZombie'], module: 'chunks:///_virtual/SkyDroneZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  { key: 'empSky', label: '脉冲黄桃·裁决者', names: ['SkyArbiterXZombie'], module: 'chunks:///_virtual/SkyArbiterXZombie.ts', methods: ['empStun'], mode: 'empDrop' },
  // ── 6. 像素僵尸：每秒自扣 10 血，无视防具 ──
  // eighties_8bit 是 ZombieEnum 值（334），没有专属引擎类，只能按 ID 过滤。
  // 挂 Zombie.prototype.characterUpdate —— 该入口不被任何僵尸子类覆写。
  { key: 'pixelDrain', label: '像素僵尸·每秒自扣10（破防）', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['characterUpdate'], mode: 'pixelDrain' },
  // ── 7. 冰河小鬼 / 冰鼬：完全免疫冰系控制 ──
  { key: 'iceImmune', label: '冰河小鬼/冰鼬·免疫冰冻', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['setFreeze'], mode: 'iceImmune' },
  { key: 'iceImmune', label: '冰河小鬼/冰鼬·免疫减速', names: ['Zombie'], module: 'chunks:///_virtual/Zombie.ts', methods: ['setChill'], mode: 'iceImmune' },
  // ── 10. 国王：出场期间生成「隐形小鬼」，打死它即可拦截国王 ──
  { key: 'kingIntercept', label: '国王·可被拦截', names: ['DarkKingZombie'], module: 'chunks:///_virtual/DarkKingZombie.ts', methods: ['onLaneSpawnSettled'], mode: 'kingIntercept' },
]

/* ────────────────────── 基础设施 ────────────────────── */
const diagLines = []
const notedOnce = new Set()
const resolved = new Map()
const stats = { jamThrows: 0, empDrops: 0, pixelTicks: 0, iceImmune: 0, kingGuards: 0, kingIntercepts: 0, arcadeSummons: 0, spikeKills: 0, kicks: 0, selfHits: 0, mcSuicides: 0, rotateTicks: 0 }

let activeCtx = null

const REFS = { cc: null, Vec2: null, Rectangle: null, Square: null, ZombieDamageDetails: null, ZombieDamageType: null }

const SQUARE_W_FALLBACK = 68
const SQUARE_H_FALLBACK = 80.77

function note(line) {
  try {
    if (diagLines.length >= 200) return
    diagLines.push(String(line))
  } catch (err) {}
}

/** 关键事件：既进诊断缓冲，也立刻写进游戏日志（搜 [僵尸调整] 就能看到） */
function logLine(ctx, line) {
  note(line)
  const c = ctx || activeCtx
  try {
    if (c && c.log && typeof c.log.info === 'function') c.log.info('[僵尸调整] ' + line)
  } catch (err) {}
}
function noteOnce(key, line) {
  try {
    if (notedOnce.has(key)) return
    notedOnce.add(key)
    note(line)
  } catch (err) {}
}
function errText(err) {
  return err && err.message ? err.message : String(err)
}

function moduleExport(engine, modulePath, exportName) {
  if (!engine || typeof engine.getModuleExport !== 'function') return null
  try {
    const got = engine.getModuleExport(modulePath, exportName)
    return typeof got === 'function' ? got : null
  } catch (err) {
    noteOnce('exp:' + exportName, `getModuleExport(${exportName}) 抛错 ${errText(err)}`)
    return null
  }
}

/** 导出值不一定是函数（例如 ZombieDamageType 是个枚举对象），这里要原样拿回来 */
function moduleValue(engine, modulePath, exportName) {
  if (!engine || typeof engine.getModuleExport !== 'function') return null
  try {
    const got = engine.getModuleExport(modulePath, exportName)
    return got === undefined ? null : got
  } catch (err) {
    noteOnce('val:' + exportName, `getModuleExport(${exportName}) 抛错 ${errText(err)}`)
    return null
  }
}

function ccClass(engine, name) {
  try {
    const cc = engine && typeof engine.getCc === 'function' ? engine.getCc() : null
    const got = cc && cc.js && cc.js.getClassByName ? cc.js.getClassByName(name) : null
    if (typeof got === 'function') return got
  } catch (err) {}
  try {
    const got = engine && typeof engine.getClassByName === 'function' ? engine.getClassByName(name) : null
    if (typeof got === 'function') return got
  } catch (err) {}
  return null
}

/** 多路定位，并且要求原型上真有目标方法（能自动把门面/同名干扰类剔掉） */
function locateClass(engine, names, modulePath, methodName) {
  const push = []
  for (const n of names) push.push(['getModuleExport(' + n + ')', moduleExport(engine, modulePath, n)])
  for (const n of names) push.push(['cc.js(' + n + ')', ccClass(engine, n)])
  for (const [how, cls] of push) {
    if (typeof cls !== 'function' || !cls.prototype) continue
    if (typeof cls.prototype[methodName] === 'function') return { cls, how }
  }
  // 目标方法可能是继承来的：退一步，只看 prototype 是否存在
  for (const [how, cls] of push) {
    if (typeof cls === 'function' && cls.prototype) return { cls, how }
  }
  return null
}

function resolveEngineRefs(engine, ctx) {
  try {
    const cc = engine && typeof engine.getCc === 'function' ? engine.getCc() : null
    REFS.cc = cc || null
    REFS.Vec2 = (cc && cc.Vec2) || null
  } catch (err) {
    note('cc 命名空间解析失败 ' + errText(err))
  }
  REFS.Rectangle = moduleExport(engine, 'chunks:///_virtual/CharacterManager.ts', 'Rectangle')
  REFS.ZombieDamageDetails = moduleExport(engine, 'chunks:///_virtual/CharacterManager.ts', 'ZombieDamageDetails')
  REFS.ZombieDamageType = moduleValue(engine, 'chunks:///_virtual/CharacterManager.ts', 'ZombieDamageType')
  REFS.Square = moduleExport(engine, 'chunks:///_virtual/Square.ts', 'Square')
  const line =
    '依赖：Rectangle=' + (REFS.Rectangle ? 'ok' : '缺') +
    ' ZombieDamageDetails=' + (REFS.ZombieDamageDetails ? 'ok' : '缺') +
    ' ZombieDamageType=' + (REFS.ZombieDamageType ? 'ok' : '缺') +
    ' Square=' + (REFS.Square ? 'ok' : '缺') +
    ' Vec2=' + (REFS.Vec2 ? 'ok' : '缺')
  note(line)
  try {
    if (ctx && ctx.log && typeof ctx.log.info === 'function') ctx.log.info('[僵尸调整] ' + line)
  } catch (err) {}
}

function squareSize() {
  let w = SQUARE_W_FALLBACK
  let h = SQUARE_H_FALLBACK
  try {
    const S = REFS.Square
    if (S && typeof S.SquareWidth === 'number') w = S.SquareWidth
    if (S && typeof S.SquareHeight === 'number') h = S.SquareHeight
  } catch (err) {}
  return { w, h }
}

/** 以 (x, y) 为中心、宽 squaresW 格的矩形；拿不到引擎 Rectangle 就返回 null */
function makeRect(x, y, squaresW, height) {
  const R = REFS.Rectangle
  const V2 = REFS.Vec2
  if (!R || !V2 || typeof R.createRectangleCenter !== 'function') return null
  try {
    return R.createRectangleCenter(new V2(x, y), squaresW, height)
  } catch (err) {
    noteOnce('rect', '建矩形失败：' + errText(err))
    return null
  }
}

/** 给自己来一下（走引擎伤害管线，死亡动画/音效照常） */
function selfHit(z, amount) {
  const ZDD = REFS.ZombieDamageDetails
  if (!ZDD || !z) return false
  try {
    const d = new ZDD(amount, true, true, true, null)
    z.dealDamage(d)
    stats.selfHits += 1
    return true
  } catch (err) {
    noteOnce('selfhit', '自伤失败：' + errText(err))
    return false
  }
}

/* ────────────────────── 各条行为 ────────────────────── */

/**
 * 2+5. 重金属巨人：舞台效果（Jam）期间，把原本的空 A 改成直接扔小鬼。
 *
 * 音波原本是在 `onSmashing` 里射出的（`shootOnePea(WaveType)`，投射物 1000 伤害）。
 * 现在只要处于舞台效果期间，就改为扔小鬼、**且不受「每巨人一只」的限制**。
 *
 * 引擎依据：
 *   · `EightiesGargantuarProps.ImpType = "eighties_imp"` —— 小鬼类型现成
 *   · 基类 `GargantuarZombie` 提供 `throwImpNow()` / `haveImp` / `getImpColumn()`
 *   · `isInJam` 为真 = 处于舞台效果期间
 */
function handlerJamThrowImp(entry, thisArg, args, callNext) {
  try {
    if (thisArg && typeof thisArg.throwImpNow === 'function') {
      let inJam = false
      try { inJam = thisArg.isInJam === true } catch (e) { /* 读不到就按非舞台处理 */ }
      if (inJam) {
        // 「无限小鬼」的关键：每次投掷前把 haveImp 补满，
        // 绕过基类「一个巨人只带一只小鬼」的限制
        try { thisArg.haveImp = true } catch (e) { /* 写不进就交给引擎自己判断 */ }
        thisArg.throwImpNow()
        stats.jamThrows += 1
        return undefined          // 不再射音波 —— 空 A 变成扔鬼
      }
    }
  } catch (err) {
    noteOnce('jamthrow', '舞台效果扔小鬼失败：' + errText(err))
  }
  return callNext(...args)        // 非舞台期间保持普通砸击与原行为
}

/**
 * 1. 脉冲黄桃：瘫痪并**强制落地**（僵王除外）。
 *
 * 引擎依据：
 *   · 基类 `Zombie.empStun` 是空函数，全引擎只有 12 处覆写；
 *     飞行僵尸里**只有 `SkyDroneZombie`** 有（内容是 `playDie()`）。
 *     ⇒ 其余四类飞机原本对脉冲黄桃完全免疫，这正是本条要补的缺口。
 *   · `flying` 是带副作用的访问器：从 true 变 false 会触发
 *     `onLanding()` → `specialZombieOnLandingForced()` —— 这就是"强制落地"。
 *   · `SkyImpZombie` 自带样例：`playSpecialZombieDieForced() { this.flying = false }`。
 *
 * 注意：僵王（`ZombossMechZombie` / `SkyZombossMechZombie`）不在目标之列。
 */
function handlerEmpDrop(entry, thisArg, args, callNext) {
  try {
    const r = callNext(...args)      // 先放行原实现（无人机在这一步就已经 playDie）
    try {
      if (thisArg && thisArg.flying === true) {
        thisArg.flying = false       // 强制落地 → onLanding() → specialZombieOnLandingForced()
        stats.empDrops += 1
      }
    } catch (e) { /* 读不到 flying 就只瘫痪、不落地 */ }
    return r
  } catch (err) {
    noteOnce('empstun', '脉冲瘫痪失败：' + errText(err))
    return callNext(...args)
  }
}

/**
 * 6. 像素僵尸：每秒扣 10 血，**无视防具**。
 *
 * 引擎依据：
 *   · `eighties_8bit` 是 ZombieEnum 值（334），没有专属引擎类 —— 只能按 ID 过滤。
 *   · `Zombie.prototype.characterUpdate` 不被任何僵尸子类覆写，
 *     是唯一每帧对所有僵尸都执行的入口。
 *   · `defaultDealDamage` 里若 `t.armorProtection` 为假，就直接扣主体 `health`、
 *     完全绕过防具 —— 这就是"无视防具"的正统写法。
 */
function handlerPixelDrain(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    if (thisArg && thisArg.ID === PIXEL_ZOMBIE_ID && !thisArg.dead) {
      const dt = Number(args[0]) || 0
      thisArg.__zfaDrain = (thisArg.__zfaDrain || 0) + dt
      while (thisArg.__zfaDrain >= 1) {
        thisArg.__zfaDrain -= 1
        selfHitIgnoreArmor(thisArg, CFG.pixelZombieSelfHitPerSec)
        stats.pixelTicks += 1
      }
    }
  } catch (err) {
    noteOnce('pixeldrain', '像素僵尸自扣血失败：' + errText(err))
  }
  return r
}

/**
 * 无视防具的固定伤害。
 * 关键：把 `armorProtection` 置假，`defaultDealDamage` 就会跳过防具、直接扣 `health`。
 */
function selfHitIgnoreArmor(z, amount) {
  try {
    const ZDD = REFS.ZombieDamageDetails
    if (!ZDD) return false
    const d = new ZDD(amount, false, false, false, null)
    d.damage = amount
    d.armorProtection = false      // ← 绕过防具的关键
    z.dealDamage(d)
    return true
  } catch (err) {
    noteOnce('ignorearmor', '破防伤害结算失败：' + errText(err))
    return false
  }
}

/**
 * 7. 冰河小鬼 / 冰鼬：完全免疫冰系控制。
 *
 * 引擎依据：
 *   · `Zombie.setFreeze(seconds, flag)` 是冰冻的统一下发口，内部会按
 *     `objdataOwn.ChillInsteadOfFreeze` 或 `flying` 决定走减速还是真冰冻。
 *   · `Zombie.setChill(seconds)` 是减速的下发口。
 *   · 两个入口都定义在 `Zombie.prototype` 上。
 *   ⇒ 对目标僵尸把这两个入口直接拦掉，即「完全免疫冰系」。
 */
function handlerIceImmune(entry, thisArg, args, callNext) {
  try {
    if (thisArg && ICE_IMMUNE_IDS.indexOf(thisArg.ID) >= 0) {
      stats.iceImmune += 1
      return undefined          // 拦掉 —— 不进冰冻、也不进减速
    }
  } catch (err) { /* 读不到 ID 就放行 */ }
  return callNext(...args)
}

/**
 * 10. 国王可被拦截。
 *
 * 需求：出场动画期间生成一个「隐形小鬼」，把它打死就直接拦截还没降临的国王。
 *
 * 引擎依据：
 *   · `DarkKingZombie.onLaneSpawnSettled()` 里播放 `"Spawn"` 动画 —— 这就是「降临」过程。
 *   · `DarkKingZombie.playSpecialGridZombieDieForced()` 是现成的强制终结入口（拦截用）。
 *   · 生成僵尸走 `inLnC.SpawnZombie(zombieEnum, styleEnum)`（引擎里 `bowlingInfiNut`
 *     就是这么生成护盾的），另有 `SpawnZombieByZombieType(type, style, ...)` 的写法。
 */
function handlerKingIntercept(entry, thisArg, args, callNext) {
  const r = callNext(...args)
  try {
    if (thisArg && !thisArg.__zfaKingGuarded) {
      thisArg.__zfaKingGuarded = true
      summonKingGuardian(thisArg)
    }
  } catch (err) {
    noteOnce('kingintercept', '国王拦截：在场标记写入失败 ' + errText(err))
  }
  return r
}

/** 生成守护小鬼并挂上死亡回调；生成是异步的，失败一律降级为「不拦截」 */
function summonKingGuardian(king) {
  try {
    const lnc = king.inLnC
    if (!lnc || typeof lnc.SpawnZombie !== 'function') {
      noteOnce('kingnolane', '国王拦截：拿不到 inLnC.SpawnZombie，本条不生效')
      return
    }
    Promise.resolve(
      lnc.SpawnZombie(CFG.kingGuardianImpType, CFG.kingGuardianSpawnStyle)
    ).then((list) => {
      const imp = list && list[0]
      if (!imp) { noteOnce('kingnoimp', '国王拦截：守护小鬼没有生成出来'); return }
      imp.__zfaKingGuardianFor = king
      king.__zfaKingGuardian = imp
      applyGhostLook(imp)
      installGuardianDeathHook(imp)
      stats.kingGuards += 1
      logLine(null, `国王拦截：已生成守护小鬼（类型 ${CFG.kingGuardianImpType}，透明度 ${CFG.kingGuardianOpacity}）`)
    }).catch((err) => {
      noteOnce('kingguardfail', '国王拦截：小鬼生成失败 ' + errText(err))
    })
  } catch (err) {
    noteOnce('kingguard', '国王拦截：生成流程异常 ' + errText(err))
  }
}

/** 「隐形」只降透明度 —— 保留可见性与碰撞判定，否则玩家就打不到它了 */
function applyGhostLook(imp) {
  try {
    const a = Math.round(255 * CFG.kingGuardianOpacity)
    if (imp.node) imp.node.opacity = a
    if (imp.body && imp.body.node) imp.body.node.opacity = a
  } catch (err) { /* 拿不到节点就保持原样 */ }
}

/** 覆盖实例的死亡入口：小鬼一死就终结国王 */
function installGuardianDeathHook(imp) {
  try {
    const orig = imp.playDie
    if (typeof orig !== 'function') return
    imp.playDie = function (...a) {
      try { onKingGuardianDied(imp) } catch (e) { /* 拦截失败不影响死亡流程 */ }
      return orig.apply(this, a)
    }
  } catch (err) {
    noteOnce('kinghook', '国王拦截：小鬼死亡钩子挂载失败 ' + errText(err))
  }
}

/** 守护小鬼死亡 → 强制终结尚未降临的国王 */
function onKingGuardianDied(imp) {
  try {
    if (imp && imp.__zfaGuardianResolved) return    // 同一只小鬼只结算一次
    const king = imp && imp.__zfaKingGuardianFor
    if (!king || king.dead) return
    if (imp) imp.__zfaGuardianResolved = true
    if (typeof king.playSpecialGridZombieDieForced === 'function') {
      king.playSpecialGridZombieDieForced()
      logLine(null, '国王拦截成功：守护小鬼被击杀，未降临的国王已被终结')
    } else if (typeof king.playDie === 'function') {
      king.playDie()          // 退化路径：至少让国王退场
      logLine(null, '国王拦截成功（退化路径）：国王已退场')
    } else {
      noteOnce('kingnodeath', '国王拦截：国王没有可用的终结入口')
      return
    }
    stats.kingIntercepts += 1
  } catch (err) {
    noteOnce('kingkill', '国王拦截：结算失败 ' + errText(err))
  }
}

/** 3. 街机游戏机：摘掉像素铁桶 + 每次召唤自扣血 */
function handlerArcade(entry, thisArg, args, callNext) {
  let flag = null
  try {
    // 召唤池挂在实例的 objdataOwn 上，直接摘掉铁桶（幂等）
    const own = thisArg && thisArg.objdataOwn
    if (own && Array.isArray(own.SummonnedZombies)) {
      const before = own.SummonnedZombies.length
      own.SummonnedZombies = own.SummonnedZombies.filter((e) => e && e.Type !== 'eighties_8bit_armor2')
      if (own.SummonnedZombies.length !== before) noteOnce('pool', '街机召唤池已摘掉像素铁桶（eighties_8bit_armor2）')
    }
  } catch (err) {
    noteOnce('poolerr', '改召唤池失败：' + errText(err))
  }
  try {
    const dt = Number(args && args[0])
    const before = Number(thisArg && thisArg.summonCD)
    flag = { dt, before }
  } catch (err) {}
  const ret = callNext(...args)
  try {
    if (flag && Number.isFinite(flag.before) && Number.isFinite(flag.dt)) {
      const after = Number(thisArg.summonCD)
      // 召唤刚发生的特征：召唤前剩余 CD 已被本帧耗完，调用后 CD 被重置成新的随机值
      if (flag.before > 0 && flag.before - flag.dt <= 1e-9 && after !== flag.before) {
        selfHit(thisArg, CFG.arcadeSummonSelfHit)
        stats.arcadeSummons += 1
      }
    }
  } catch (err) {
    noteOnce('arcadehit', '街机召唤自扣血失败：' + errText(err))
  }
  return ret
}

/** 4. 轮滑（闪耀）僵尸：被地刺一击必杀（照抄引擎里载具僵尸的写法） */
function handlerSpike(entry, thisArg, args, callNext) {
  try {
    const spikes = Array.isArray(args && args[0]) ? args[0] : []
    if (typeof thisArg.playDie === 'function') thisArg.playDie()
    for (const sw of spikes) {
      try {
        if (sw && typeof sw.normalSmash === 'function') sw.normalSmash(thisArg)
      } catch (err) {}
    }
    stats.spikeKills += 1
    return undefined
  } catch (err) {
    noteOnce('spike', '地刺秒杀失败，放行原实现：' + errText(err))
    return callNext(...args)
  }
}

/** 5. 霹雳舞：一次只踢一只僵尸；踢到之后自己掉 50 血 */
function handlerKick(entry, thisArg, args, callNext) {
  try {
    const V2 = REFS.Vec2
    const { w, h } = squareSize()
    let lane = null
    try {
      lane = thisArg.inLane
    } catch (err) {
      lane = null
    }
    if (!lane || !V2 || typeof thisArg.zombieKickable !== 'function') return callNext(...args)

    const rect = makeRect(thisArg.worldPositionX, lane.midY, 1.5 * w, h)
    const pool = thisArg.hypnotized ? lane.hypnoZombiePool() : lane.zombiePool()
    if (!Array.isArray(pool) || !rect) return callNext(...args)

    const target = pool.find((z) => z && thisArg.zombieKickable(z, rect))
    if (!target) return undefined

    const own = thisArg.objdataOwn || {}
    const dir = new V2(Number(own.KickDistance) * (thisArg.reversed ? 1 : -1), 0)
    if (typeof target.leapBy === 'function') target.leapBy(dir, true, 0.5, 40, true, false, true)
    stats.kicks += 1
    selfHit(thisArg, CFG.breakdancerKickSelfHit)
    return undefined
  } catch (err) {
    noteOnce('kick', '只踢一只的逻辑失败，放行原实现：' + errText(err))
    return callNext(...args)
  }
}

/** 6/8. 甩完麦自杀 / 扔完章鱼自扣血 */
function makeSelfHitAfter(entry) {
  return function (thisArg, args, callNext) {
    const ret = callNext(...args)
    const amount = Number(CFG[entry.hit])
    if (Number.isFinite(amount) && amount > 0) {
      const key = entry.key
      if (key === 'mcSelfKill') {
        // 自杀：只在真的活着的时候算一次
        if (!thisArg.dead) {
          selfHit(thisArg, amount)
          stats.mcSuicides += 1
        }
      } else {
        selfHit(thisArg, amount)
      }
    }
    return ret
  }
}

function handlerRotate(entry, thisArg, args, callNext) {
  const ret = callNext(...args)
  try {
    const dt = Number(args && args[0])
    if (dt > 0 && thisArg.rotating) {
      selfHit(thisArg, CFG.jesterRotateSelfHitPerSec * dt)
      stats.rotateTicks += 1
    }
  } catch (err) {
    noteOnce('rotate', '旋转掉血失败：' + errText(err))
  }
  return ret
}

function makeHandler(entry) {
  return function ({ thisArg, args, callNext }) {
    try {
      switch (entry.mode) {
        case 'jamThrow':
          return handlerJamThrowImp(entry, thisArg, args, callNext)
        case 'empDrop':
          return handlerEmpDrop(entry, thisArg, args, callNext)
        case 'pixelDrain':
          return handlerPixelDrain(entry, thisArg, args, callNext)
        case 'iceImmune':
          return handlerIceImmune(entry, thisArg, args, callNext)
        case 'kingIntercept':
          return handlerKingIntercept(entry, thisArg, args, callNext)
        case 'arcade':
          return handlerArcade(entry, thisArg, args, callNext)
        case 'spike':
          return handlerSpike(entry, thisArg, args, callNext)
        case 'kick':
          return handlerKick(entry, thisArg, args, callNext)
        case 'selfHitAfter':
          return makeSelfHitAfter(entry)(thisArg, args, callNext)
        case 'rotate':
          return handlerRotate(entry, thisArg, args, callNext)
        default:
          return callNext(...args)
      }
    } catch (err) {
      noteOnce('h:' + entry.label, entry.label + ' 钩子异常（已放行原实现）：' + errText(err))
      return callNext(...args)
    }
  }
}

/** 继承来的方法先固化成自有属性，避免包装时连累父类 */
function materializeInherited(target, methodName) {
  try {
    if (Object.prototype.hasOwnProperty.call(target, methodName)) return
    const inherited = target[methodName]
    if (typeof inherited !== 'function') return
    target[methodName] = function (...a) {
      return inherited.apply(this, a)
    }
  } catch (err) {}
}

function installHook(ctx, entry, cls) {
  const hooks = ctx.unsafe && ctx.unsafe.hooks
  const proto = cls.prototype
  const methods = entry.methods && entry.methods.length ? entry.methods : [entry.method]
  let mounted = 0
  for (const method of methods) {
    if (typeof proto[method] !== 'function') {
      noteOnce('nom:' + entry.names[0] + ':' + method, entry.label + ': 原型上没有 ' + method)
      continue
    }
    // 继承来的方法先固化成自有属性，避免包装时连累父类
    materializeInherited(proto, method)

    if (hooks && typeof hooks.wrapMethod === 'function') {
      try {
        hooks.wrapMethod({ target: proto, methodName: method, handler: makeHandler(entry) })
        mounted += 1
        continue
      } catch (err) {
        noteOnce('wrap:' + method, entry.label + '.' + method + ': wrapMethod 抛错，改用直接包装 ' + errText(err))
      }
    }
    try {
      const orig = proto[method]
      const handler = makeHandler(entry)
      proto[method] = function (...a) {
        return handler({ thisArg: this, args: a, callNext: (...x) => orig.apply(this, x) })
      }
      noteOnce('directwrap', entry.label + ': 使用直接包装（未走 hooks.wrapMethod）')
      mounted += 1
    } catch (err) {
      note(entry.label + '.' + method + ': 直接包装失败 ' + errText(err))
    }
  }
  return mounted
}

/* ────────────────────── 面板 / 诊断 ────────────────────── */
function describeStats() {
  return [
    `音波AOE拦截 ${stats.blocked}`,
    `街机召唤 ${stats.arcadeSummons}`,
    `地刺秒杀 ${stats.spikeKills}`,
    `踢击 ${stats.kicks}`,
    `自杀/自扣 ${stats.selfHits}`,
  ].join(' · ')
}

function dumpDiagnostics(ctx) {
  ctx.log.info('[僵尸调整] ---- 诊断 ----')
  for (let i = 0; i < diagLines.length; i++) ctx.log.info('[僵尸调整] ' + diagLines[i])
  ctx.log.info('[僵尸调整] 统计：' + describeStats())
  ctx.log.info('[僵尸调整] ---- 诊断结束 ----')
}

function definePanel(ctx) {
  try {
    ctx.controls.definePanel({
      title: '妙趣横生的僵尸调整',
      description: '十条僵尸体验改动。小鬼血量为数据改动（重启即生效），其余九条在运行期生效。',
      groups: [
        {
          title: '挂载状态',
          items: TARGETS.map((t) => ({
            type: 'readonly',
            key: 'hook-' + t.mode + '-' + t.names[0],
            label: t.label + '（' + t.names[0] + '）',
            getValue: () => {
              const r = resolved.get(t.names[0])
              if (!r) return '未定位到类'
              const total = (t.methods || [t.method]).length
              if (!r.mounted) return '定位到类，但一个方法都没挂上'
              return `已挂载 ${r.mounted}/${total} 个入口` + (r.mounted < total ? '（部分入口缺失）' : '')
            },
          })),
        },
        {
          title: '触发统计',
          items: [
            { type: 'readonly', key: 'stats', label: '累计', getValue: () => describeStats() },
            {
              type: 'readonly',
              key: 'cfg',
              label: '可调数值',
              getValue: () =>
                `街机召唤自扣 ${CFG.arcadeSummonSelfHit} · 踢击自扣 ${CFG.breakdancerKickSelfHit} · 章鱼自扣 ${CFG.octopusThrowSelfHit} · 弄臣 ${CFG.jesterRotateSelfHitPerSec}/秒`,
            },
          ],
        },
        {
          title: '操作',
          items: [
            {
              type: 'action',
              key: 'diag',
              label: '输出诊断到日志',
              onClick: () => {
                dumpDiagnostics(ctx)
                ctx.ui.toast('诊断已写入日志', 'info')
              },
            },
            {
              type: 'action',
              key: 'reset',
              label: '清零统计',
              onClick: () => {
                for (const k of Object.keys(stats)) stats[k] = 0
                ctx.ui.toast('统计已清零', 'info')
              },
            },
          ],
        },
      ],
    })
  } catch (err) {
    ctx.log.warn('[僵尸调整] 面板创建失败：' + errText(err))
  }
}

/* ────────────────────── 生命周期 ────────────────────── */
export default {
  startup(ctx) {
    try {
      activeCtx = ctx || activeCtx
      if (!ctx || !ctx.engine) {
        note('startup: ctx.engine 不可用')
        return
      }
      resolveEngineRefs(ctx.engine, ctx)
      let found = 0
      for (const entry of TARGETS) {
        const methods = entry.methods && entry.methods.length ? entry.methods : [entry.method]
        const loc = locateClass(ctx.engine, entry.names, entry.module, methods[0])
        if (loc) {
          resolved.set(entry.names[0], { cls: loc.cls, how: loc.how, entry, methods, mounted: 0 })
          found += 1
          logLine(ctx, `定位 ${entry.names[0]}（${loc.how}）→ 待挂 ${methods.join(' + ')}`)
        } else {
          note(entry.label + '（' + entry.names[0] + '）未定位到类')
          logLine(ctx, `✗ 未定位到类：${entry.label}（候选名 ${entry.names.join(' / ')}）`)
        }
      }
      ctx.log.info(`[僵尸调整] startup 定位 ${found}/${TARGETS.length} 个僵尸类`)
      if (found < TARGETS.length) dumpDiagnostics(ctx)
    } catch (err) {
      note('startup 顶层异常: ' + errText(err))
      try {
        ctx.log.error('[僵尸调整] startup 异常：' + errText(err))
        dumpDiagnostics(ctx)
      } catch (inner) {}
    }
  },

  setup(ctx) {
    try {
      activeCtx = ctx || activeCtx
      if (!ctx || !ctx.unsafe || !ctx.unsafe.hooks || typeof ctx.unsafe.hooks.wrapMethod !== 'function') {
        note('setup: 没有可用的 unsafe.hooks.wrapMethod')
        dumpDiagnostics(ctx)
        return
      }
      let hooked = 0
      let methodTotal = 0
      const failed = []
      for (const entry of TARGETS) {
        const rec = resolved.get(entry.names[0])
        if (!rec) {
          failed.push(entry.label + '（未定位）')
          continue
        }
        try {
          const m = installHook(ctx, entry, rec.cls)
          rec.mounted = m
          if (m > 0) {
            hooked += 1
            methodTotal += m
            logLine(ctx, `✓ 已挂载 ${entry.names[0]} → ${(entry.methods || [entry.method]).join(' + ')}（成功 ${m} 个入口）`)
          } else {
            failed.push(entry.label + '（一个入口都没挂上）')
            logLine(ctx, `✗ 挂载失败：${entry.label}（${entry.names[0]}）`)
          }
        } catch (err) {
          note(entry.label + ' 挂载抛错 ' + errText(err))
          failed.push(entry.label + '（抛错）')
        }
      }
      ctx.log.info(`[僵尸调整] 已挂载 ${hooked}/${TARGETS.length} 个僵尸类（共 ${methodTotal} 个方法入口）`)
      if (failed.length) note('未挂载：' + failed.join('、'))

      if (hooked === 0) {
        dumpDiagnostics(ctx)
        ctx.ui.toast('僵尸调整：钩子全部挂载失败（详见日志）', 'error')
        return
      }
      ctx.ui.toast(`僵尸调整已生效（${hooked}/${TARGETS.length} 个僵尸类）`, 'success')
      definePanel(ctx)
    } catch (err) {
      try {
        ctx.log.error('[僵尸调整] setup 异常：' + errText(err))
        dumpDiagnostics(ctx)
      } catch (inner) {}
    }
  },
}

// 供模拟测试读取内部状态（游戏内不会用到这些导出）
export const __test__ = {
  CFG,
  TARGETS,
  stats,
  resolved,
  /** 重新挂载一次（测试里重置用） */
  resetRuntime() {
    for (const k of Object.keys(stats)) stats[k] = 0
    resolved.clear()
    notedOnce.clear()
    diagLines.length = 0
  },
  makeHandler,
  installHook,
  locateClass,
  handlerJamThrowImp,
  handlerEmpDrop,
  handlerPixelDrain,
  handlerIceImmune,
  handlerKingIntercept,
  summonKingGuardian,
  onKingGuardianDied,
  applyGhostLook,
  installGuardianDeathHook,
  selfHitIgnoreArmor,
  PIXEL_ZOMBIE_ID,
  ICE_IMMUNE_IDS,
  handlerArcade,
  handlerSpike,
  handlerKick,
  handlerRotate,
  makeSelfHitAfter,
  selfHit,
  setRefs(refs) { Object.assign(REFS, refs || {}) },
  getRefs() { return REFS },
  getDiag() { return diagLines.slice() },
}
