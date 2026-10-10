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
 *  7. 失落巨人：它自带 ignited（火把状态，默认 true，被冰冻/减速会熄灭）与 FireDamage；
 *     沙漠探险家的焚烧是 detectPlantWithTorch：对 plantDetectorRec 内的植物/墓碑按 FireDPS×dt 施加 fire 伤害。
 *     ⇒ 每帧只要 ignited，就对身前矩形内的植物/墓碑施加同样的 fire 伤害（无需攻击动作）。
 *  8. 章鱼：投掷在 specialAnimationListener 的 "throw" 事件 → _throw()。
 *     ⇒ _throw 之后自扣 150。
 *  9. 弄臣：specialZombieUpdate 里维护 rotating 状态。
 *     ⇒ rotating 期间按秒持续掉血。
 * 10. 未来三只（机甲路障 / 机甲橄榄球盔 / 巨尸统领者）：死亡统一走基类 Zombie.playDie()。
 *     ⇒ 在 playDie 前对半径 1 格内的植物结算一次爆炸伤害（一次性）。
 */
const CFG = {
  arcadeSummonSelfHit: 100, // 街机柜每召唤一次小怪，自己掉多少血（需求未给数值，这里取 100）
  breakdancerKickSelfHit: 50, // 霹雳舞每踢一次自扣（需求指定 50）
  octopusThrowSelfHit: 150, // 章鱼每扔一次自扣（需求指定 150）
  jesterRotateSelfHitPerSec: 20, // 弄臣旋转时每秒掉血（1.0.1：按主人要求从 30 下调到 20）
  explosionDamage: 1800, // 未来三只自爆伤害（需求未给数值，这里取爆炸级 1800）
  explodeRangeSquares: 2, // 自爆范围：以自身为中心、宽 2 格（即半径 1 格）
  burnDPS: 1000, // 失落巨人焚烧 DPS，与沙漠探险家的 FireDPS 一致
  selfKillDamage: 999999, // 「自杀」用的致死伤害
}

/** 每个类：定位名候选 + 模块路径 + 要包的方法 + 行为模式 */
const TARGETS = [
  { key: 'gargantuarAoe', label: '重金属巨人·音波 AOE', names: ['EightiesGargantuarZombie'], module: 'chunks:///_virtual/EightiesGargantuarZombie.ts', methods: ['onSmashing'], mode: 'block' },
  { key: 'arcadeSummon', label: '街机游戏机·召唤自扣血+禁铁桶', names: ['EightiesArcadeCabinet'], module: 'chunks:///_virtual/EightiesArcadeCabinet.ts', methods: ['specialTombUpdate'], mode: 'arcade' },
  { key: 'glitterSpike', label: '轮滑（闪耀）·地刺秒杀', names: ['EightiesGlitterZombie', 'EightiesGlitterZombieZombie'], module: 'chunks:///_virtual/EightiesGlitterZombie.ts', methods: ['whenStabbedBySpikeWeed'], mode: 'spike' },
  { key: 'breakdancerKick', label: '霹雳舞·一次只踢一只+自扣50', names: ['EightiesBreakDancerZombie', 'EightiesBreakDancerZombieZombie'], module: 'chunks:///_virtual/EightiesBreakDancerZombie.ts', methods: ['kick'], mode: 'kick' },
  { key: 'mcSelfKill', label: '麦克说唱家·甩完麦自杀', names: ['EightiesMCZombie'], module: 'chunks:///_virtual/EightiesMCZombie.ts', methods: ['attack'], mode: 'selfHitAfter', hit: 'selfKillDamage' },
  { key: 'octopusSelfHit', label: '章鱼僵尸·投掷自扣150', names: ['BeachOctopusZombie'], module: 'chunks:///_virtual/BeachOctopusZombie.ts', methods: ['_throw'], mode: 'selfHitAfter', hit: 'octopusThrowSelfHit' },
  { key: 'lostGargBurn', label: '失落巨人·火把持续焚烧', names: ['LostcityGargantuarZombie'], module: 'chunks:///_virtual/LostcityGargantuarZombie.ts', methods: ['specialGargantuarUpdate'], mode: 'burn' },
  { key: 'jesterRotate', label: '弄臣·旋转持续掉血', names: ['DarkJesterZombie'], module: 'chunks:///_virtual/DarkJesterZombie.ts', methods: ['specialZombieUpdate'], mode: 'rotate' },
  // 未来三只：死亡入口多路挂（playDie=统一死亡、judgeDeath=死亡动画、onDamagedToHealth0=血量归零），
  // 三条共用同一个「已炸」标记，谁先到谁炸，一关只炸一次。
  { key: 'futureBomb', label: '未来三只·死后自爆', names: ['FutureMechConeZombie'], module: 'chunks:///_virtual/FutureMechConeZombie.ts', methods: ['playDie', 'judgeDeath', 'onDamagedToHealth0'], mode: 'bomb' },
  { key: 'futureBomb', label: '未来三只·死后自爆', names: ['FutureMechFootballZombie'], module: 'chunks:///_virtual/FutureMechFootballZombie.ts', methods: ['playDie', 'judgeDeath', 'onDamagedToHealth0'], mode: 'bomb' },
  { key: 'futureBomb', label: '未来三只·死后自爆', names: ['FutureGargantuarZombie'], module: 'chunks:///_virtual/FutureGargantuarZombie.ts', methods: ['playDie', 'judgeDeath', 'onDamagedToHealth0'], mode: 'bomb' },
]

/* ────────────────────── 基础设施 ────────────────────── */
const diagLines = []
const notedOnce = new Set()
const resolved = new Map()
const stats = { blocked: 0, arcadeSummons: 0, spikeKills: 0, kicks: 0, selfHits: 0, mcSuicides: 0, burns: 0, rotateTicks: 0, bombs: 0, explodeHits: 0, lastExplode: '' }

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

/** 2. 重金属巨人：拦掉音波 AOE（普通砸击在 _smash 里，不受影响） */
function handlerBlock(entry, thisArg, args, callNext) {
  stats.blocked += 1
  noteOnce('aoe', '已拦截重金属巨人的音波 AOE（普通砸击保留）')
  return undefined
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

/** 7. 失落巨人：火把点着时，无需攻击也持续焚烧身前的植物/墓碑 */
function handlerBurn(entry, thisArg, args, callNext) {
  const ret = callNext(...args)
  try {
    const dt = Number(args && args[0])
    if (!(dt > 0) || !thisArg.ignited) return ret
    const ZDD = REFS.ZombieDamageDetails
    if (!ZDD) return ret

    let rec = null
    try {
      rec = thisArg.plantDetectorRec
    } catch (err) {
      rec = null
    }
    if (!rec) {
      const { w, h } = squareSize()
      rec = makeRect(thisArg.worldPositionX + (thisArg.reversed ? -1 : 1) * w * 0.5, thisArg.worldPositionY, w, h)
    }
    if (!rec) return ret

    const dmg = CFG.burnDPS * dt
    const fire = REFS.ZombieDamageType ? REFS.ZombieDamageType.fire : undefined
    const details = new ZDD(dmg, true, false, false, null, fire)
    let hit = 0
    try {
      const lane = thisArg.inLane
      if (lane && typeof lane.plantPool === 'function') {
        lane.plantPool().forEach((p) => {
          try {
            if (p && p.bodyRec && rec.judgeCrossRec(p.bodyRec)) {
              p.dealDamage(details)
              hit += 1
            }
          } catch (err) {}
        })
      }
      if (lane && typeof lane.tombPool === 'function') {
        lane.tombPool(thisArg.hypnotized ? 0 : 1).forEach((t) => {
          try {
            if (t && t.bodyRec && rec.judgeCrossRec(t.bodyRec)) {
              t.dealDamage(details)
              hit += 1
            }
          } catch (err) {}
        })
      }
    } catch (err) {
      noteOnce('burn', '焚烧结算失败：' + errText(err))
    }
    if (hit) stats.burns += hit
  } catch (err) {
    noteOnce('burnouter', '焚烧钩子异常：' + errText(err))
  }
  return ret
}

/** 9. 弄臣：旋转期间持续掉血 */
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

/** 10. 未来三只：死亡瞬间自爆，半径 1 格（多路触发，共用「已炸」标记） */
function handlerBomb(entry, thisArg, args, callNext) {
  try {
    if (thisArg && !thisArg.__funAdjustBombed) {
      thisArg.__funAdjustBombed = true
      explodePlants(thisArg, entry)
    }
  } catch (err) {
    noteOnce('bomb', '自爆失败：' + errText(err))
  }
  return callNext(...args)
}

/**
 * 三层降级，任一层成功即可：
 *   ① 引擎矩形（Rectangle.createRectangleCenter + judgeCrossRec，与功夫自爆僵尸同一套）
 *   ② 距离近似：|植物.x − 自身.x| ≤ 一格（不需要 Rectangle）
 *   ③ 横向距离 + 同一行（plantPool 拿不到时用 entities 之类的兜底就不写了，直接报诊断）
 * 每次尝试都会往日志写一行，实机没炸时日志能直接指出卡在哪一层。
 */
function explodePlants(z, entry) {
  const ZDD = REFS.ZombieDamageDetails
  const label = (entry && entry.label) || '未来三只'
  if (!ZDD) {
    logLine(null, `${label} 自爆未执行：没拿到 ZombieDamageDetails`)
    return
  }

  const { w, h } = squareSize()
  let lane = null
  try {
    lane = z.inLane || null
  } catch (err) {
    lane = null
  }
  let midY = z.worldPositionY
  try {
    if (lane && typeof lane.midY === 'number') midY = lane.midY
  } catch (err) {}

  const halfW = (CFG.explodeRangeSquares * w) / 2
  const rec = makeRect(z.worldPositionX, midY, CFG.explodeRangeSquares * w, h)

  let pool = null
  try {
    if (lane && typeof lane.plantPool === 'function') pool = lane.plantPool()
  } catch (err) {
    noteOnce('explodepool', '取植物池失败：' + errText(err))
  }
  if (!Array.isArray(pool)) {
    logLine(null, `${label} 自爆未执行：拿不到 inLane.plantPool()（lane=${lane ? '有' : '空'}）`)
    return
  }

  const details = new ZDD(CFG.explosionDamage, true, true, true, null)
  let hit = 0
  let path = rec ? '引擎矩形' : '距离近似'
  let missed = 0
  for (const p of pool) {
    try {
      if (!p || !p.bodyRec) continue
      let inside = false
      if (rec && typeof rec.judgeCrossRec === 'function') inside = !!rec.judgeCrossRec(p.bodyRec)
      else if (typeof p.worldPositionX === 'number') inside = Math.abs(p.worldPositionX - z.worldPositionX) <= halfW
      if (!inside) {
        missed += 1
        continue
      }
      p.dealDamage(details)
      hit += 1
    } catch (err) {
      noteOnce('explodehit', '爆炸对植物结算失败：' + errText(err))
    }
  }

  stats.bombs += 1
  stats.explodeHits += hit
  stats.lastExplode = `${label} 命中 ${hit} 株（路径=${path}，场上植物 ${pool.length} 株）`
  logLine(null, `自爆：${label} 命中 ${hit} 株植物（路径=${path}，半径 ${CFG.explodeRangeSquares / 2} 格，伤害 ${CFG.explosionDamage}；场上植物 ${pool.length} 株${missed ? '，范围外 ' + missed + ' 株' : ''}）`)
}

/* ────────────────────── 钩子装配 ────────────────────── */
function makeHandler(entry) {
  return function ({ thisArg, args, callNext }) {
    try {
      switch (entry.mode) {
        case 'block':
          return handlerBlock(entry, thisArg, args, callNext)
        case 'arcade':
          return handlerArcade(entry, thisArg, args, callNext)
        case 'spike':
          return handlerSpike(entry, thisArg, args, callNext)
        case 'kick':
          return handlerKick(entry, thisArg, args, callNext)
        case 'selfHitAfter':
          return makeSelfHitAfter(entry)(thisArg, args, callNext)
        case 'burn':
          return handlerBurn(entry, thisArg, args, callNext)
        case 'rotate':
          return handlerRotate(entry, thisArg, args, callNext)
        case 'bomb':
          return handlerBomb(entry, thisArg, args, callNext)
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
    `焚烧命中 ${stats.burns}`,
    `自爆 ${stats.bombs}（炸到植物 ${stats.explodeHits}）`,
  ].join(' · ')
}

function dumpDiagnostics(ctx) {
  ctx.log.info('[僵尸调整] ---- 诊断 ----')
  for (let i = 0; i < diagLines.length; i++) ctx.log.info('[僵尸调整] ' + diagLines[i])
  ctx.log.info('[僵尸调整] 统计：' + describeStats())
  if (stats.lastExplode) ctx.log.info('[僵尸调整] 最近一次自爆：' + stats.lastExplode)
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
            { type: 'readonly', key: 'lastExplode', label: '最近一次自爆', getValue: () => stats.lastExplode || '还没触发过' },
            {
              type: 'readonly',
              key: 'cfg',
              label: '可调数值',
              getValue: () =>
                `街机召唤自扣 ${CFG.arcadeSummonSelfHit} · 踢击自扣 ${CFG.breakdancerKickSelfHit} · 章鱼自扣 ${CFG.octopusThrowSelfHit} · 弄臣 ${CFG.jesterRotateSelfHitPerSec}/秒 · 自爆 ${CFG.explosionDamage}（半径 ${CFG.explodeRangeSquares / 2} 格）`,
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
  handlerBlock,
  handlerArcade,
  handlerSpike,
  handlerKick,
  handlerBurn,
  handlerRotate,
  handlerBomb,
  makeSelfHitAfter,
  explodePlants,
  selfHit,
  setRefs(refs) { Object.assign(REFS, refs || {}) },
  getRefs() { return REFS },
  getDiag() { return diagLines.slice() },
}
