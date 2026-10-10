/**
 * 十条改动的行为断言。
 *
 * 每条都按「钩子挂在哪、什么条件下改、什么时候还原」来验，
 * 不需要游戏本体。假类来自 harness.mjs，方法名与引擎一致。
 */
import {
  ok, near, section,
  FakeZombie, FakePlant, makeLane, callCtx, makeRefs,
} from './harness.mjs'

export function runZombies({ T, mod }) {
  // 每次跑测试前把运行期状态清干净，并注入假引擎依赖
  T.resetRuntime()
  T.setRefs(makeRefs())

  const find = (key, name) => T.TARGETS.find((t) => t.key === key && (!name || t.names[0] === name))

  // ─────────────────────── 配置与挂载表 ───────────────────────

  section('0. 配置与挂载表')

  ok(T.CFG.breakdancerKickSelfHit === 50, '霹雳舞自扣 = 50', String(T.CFG.breakdancerKickSelfHit))
  ok(T.CFG.octopusThrowSelfHit === 150, '章鱼自扣 = 150', String(T.CFG.octopusThrowSelfHit))
  ok(T.CFG.jesterRotateSelfHitPerSec === 20, '弄臣旋转 = 20/秒（1.0.1 由 30 下调）', String(T.CFG.jesterRotateSelfHitPerSec))
  ok(T.CFG.arcadeSummonSelfHit > 0, '街机召唤自扣为正数')

  ok(T.TARGETS.every((t) => t.names && t.names.length && (t.methods || t.method)), '每条都有类名与方法名')
  // ─────────────────────── 2. 重金属巨人 ───────────────────────

  section('2+5. 重金属巨人 · 舞台效果改为扔小鬼')

  {
    const entry = find('gargantuarAoe')

    // ① 舞台效果期间：扔小鬼，不再射音波
    const z = new FakeZombie({ isInJam: true, haveImp: false })
    let throws = 0
    z.throwImpNow = () => { throws += 1 }
    const { ctx, calls } = callCtx(z)
    const r = T.handlerJamThrowImp(entry, z, [{ name: 'smash' }], ctx.callNext)
    ok(r === undefined, '舞台期间返回 undefined（不吃掉原实现的返回值）')
    ok(calls.length === 0, '没有调用 callNext —— 音波不再射出')
    ok(throws === 1, '扔出一次小鬼')
    ok(z.haveImp === true, '投掷前把 haveImp 补满（「无限小鬼」的关键）')
    ok(T.stats.jamThrows === 1, '扔鬼计数 +1', String(T.stats.jamThrows))

    // ② 非舞台效果期间：保持原行为，普通砸击分毫不动
    const z2 = new FakeZombie({ isInJam: false })
    let throws2 = 0
    z2.throwImpNow = () => { throws2 += 1 }
    const c2 = callCtx(z2)
    const r2 = T.handlerJamThrowImp(entry, z2, [], c2.ctx.callNext)
    ok(throws2 === 0, '非舞台期间不扔小鬼')
    ok(c2.calls.length === 1 && r2 === 'NEXT', '非舞台期间放行原实现')

    // ③ 数量不限：连着来 5 次都扔得出去
    const z3 = new FakeZombie({ isInJam: true })
    let n = 0
    z3.throwImpNow = () => { n += 1 }
    for (let i = 0; i < 5; i++) {
      T.handlerJamThrowImp(entry, z3, [], callCtx(z3).ctx.callNext)
    }
    ok(n === 5, '连续 5 次全部扔出（不受每巨人一只的限制）', String(n))

    // ④ 异常安全：缺接口 / isInJam 抛错时都放行原实现
    const plain = new FakeZombie()
    let threw = false
    try { T.handlerJamThrowImp(entry, plain, [], callCtx(plain).ctx.callNext) } catch (e) { threw = true }
    ok(!threw, '缺少 throwImpNow 时不抛异常')

    const boom = new FakeZombie()
    Object.defineProperty(boom, 'isInJam', { get() { throw new Error('boom') } })
    let threw2 = false
    try { T.handlerJamThrowImp(entry, boom, [], callCtx(boom).ctx.callNext) } catch (e) { threw2 = true }
    ok(!threw2, 'isInJam 读取抛错时不外泄')

    ok(T.stats.blocked === undefined, '旧的「拦截音波」统计已移除')
  }

  // ─────────────────────── 1. 脉冲黄桃 ───────────────────────

  section('1. 脉冲黄桃 · 瘫痪并强制落地飞机')

  {
    const entry = { key: 'empSky', label: '测试机', names: ['X'], module: 'm', methods: ['empStun'], mode: 'empDrop' }

    // ① 正在飞的：强制落地（flying 由 true 变 false 会触发 onLanding）
    const z = new FakeZombie({ flying: true })
    const { ctx } = callCtx(z)
    T.handlerEmpDrop(entry, z, [10], ctx.callNext)
    ok(z.flying === false, '飞行中的僵尸被强制落地')
    ok(T.stats.empDrops === 1, '落地计数 +1', String(T.stats.empDrops))

    // ② 已经在地面的：不重复计数
    const z2 = new FakeZombie({ flying: false })
    const c2 = callCtx(z2)
    T.handlerEmpDrop(entry, z2, [10], c2.ctx.callNext)
    ok(z2.flying === false, '地面上的僵尸保持原状')
    ok(T.stats.empDrops === 1, '落地计数不再增加')

    // ③ 原实现照常放行（无人机的 empStun 就是 playDie）
    const z3 = new FakeZombie({ flying: true })
    const c3 = callCtx(z3)
    T.handlerEmpDrop(entry, z3, [10], c3.ctx.callNext)
    ok(c3.calls.length === 1, '原 empStun 实现被放行')
    ok(c3.calls[0][0] === 10, '原实现拿到同样的时长参数', String(c3.calls[0][0]))

    // ④ 异常安全：flying 读取抛错也不外泄
    const boom = new FakeZombie()
    Object.defineProperty(boom, 'flying', { get() { throw new Error('boom') } })
    let threw = false
    try { T.handlerEmpDrop(entry, boom, [], callCtx(boom).ctx.callNext) } catch (e) { threw = true }
    ok(!threw, 'flying 读取抛错时不外泄')

    // ⑤ 挂载表里五类飞机都在，且僵王不在
    const empEntries = T.TARGETS.filter((t) => t.mode === 'empDrop')
    ok(empEntries.length === 6, '六条飞机挂载（双体拆上下）', String(empEntries.length))
    const labels = empEntries.map((t) => t.label).join(' ')
    ok(/小鬼飞机/.test(labels) && /战斗机/.test(labels) && /无人机/.test(labels) && /裁决者/.test(labels),
      '小鬼飞机 / 战斗机 / 无人机 / 裁决者 均已覆盖', labels)
    ok(!empEntries.some((t) => /Zomboss/i.test(t.names[0])), '僵王不在目标之内')
  }

  // ─────────────────────── 6. 像素僵尸 ───────────────────────

  section('6. 像素僵尸 · 每秒自扣 10 血（无视防具）')

  {
    const entry = { key: 'pixelDrain', label: 't', names: ['Zombie'], module: 'm', methods: ['characterUpdate'], mode: 'pixelDrain' }

    // ① 累计满 1 秒才扣一次
    const z = new FakeZombie({ ID: T.PIXEL_ZOMBIE_ID })
    const c1 = callCtx(z, [0.5])
    T.handlerPixelDrain(entry, z, [0.5], c1.ctx.callNext)
    ok(z.damageTaken.length === 0, '不足 1 秒不扣血')
    const c2 = callCtx(z, [0.6])
    T.handlerPixelDrain(entry, z, [0.6], c2.ctx.callNext)
    ok(z.damageTaken.length === 1, '累计满 1 秒扣一次')
    ok(z.damageTaken[0] === 10, '每次扣 10 点', String(z.damageTaken[0]))
    ok(T.stats.pixelTicks === 1, '结算计数 +1', String(T.stats.pixelTicks))

    // ② 其它僵尸完全不受影响
    const other = new FakeZombie({ ID: 999 })
    const c3 = callCtx(other, [5])
    T.handlerPixelDrain(entry, other, [5], c3.ctx.callNext)
    ok(other.damageTaken.length === 0, '非像素僵尸不受影响')

    // ③ 已死亡的僵尸不再结算
    const dead = new FakeZombie({ ID: T.PIXEL_ZOMBIE_ID, dead: true })
    const c4 = callCtx(dead, [5])
    T.handlerPixelDrain(entry, dead, [5], c4.ctx.callNext)
    ok(dead.damageTaken.length === 0, '已死亡的僵尸不再结算')

    // ④ 无视防具：伤害对象必须带 armorProtection = false
    const probe = new FakeZombie({ ID: T.PIXEL_ZOMBIE_ID })
    let seen = null
    probe.dealDamage = (d) => { seen = d }
    T.selfHitIgnoreArmor(probe, 10)
    ok(seen !== null, '破防伤害已结算')
    ok(seen && seen.armorProtection === false,
      '标记为无视防具（armorProtection=false → defaultDealDamage 直接打主体）')
    ok(seen && seen.damage === 10, '伤害值为 10', String(seen && seen.damage))
    T.stats.pixelTicks = 0

    // ⑤ 原实现照常放行
    const z5 = new FakeZombie({ ID: T.PIXEL_ZOMBIE_ID })
    const c5 = callCtx(z5, [0.1])
    T.handlerPixelDrain(entry, z5, [0.1], c5.ctx.callNext)
    ok(c5.calls.length === 1, 'characterUpdate 原实现被放行')

    // ⑥ 缺 ZombieDamageDetails 时不抛异常
    T.setRefs({ ZombieDamageDetails: null })
    let threw = false
    try { T.selfHitIgnoreArmor(probe, 10) } catch (e) { threw = true }
    ok(!threw, '缺依赖时不抛异常')
    T.setRefs(makeRefs())

    // ⑦ 挂载点必须是 characterUpdate（不被僵尸子类覆写的那一个）
    const pe = T.TARGETS.find((t) => t.mode === 'pixelDrain')
    ok(!!pe && pe.methods[0] === 'characterUpdate',
      '挂在 Zombie.characterUpdate 上', pe ? pe.methods.join(',') : '(缺失)')
    ok(T.PIXEL_ZOMBIE_ID === 334, '像素僵尸 ID = 334（eighties_8bit）', String(T.PIXEL_ZOMBIE_ID))
  }

  // ─────────────────────── 7. 冰河小鬼 / 冰鼬 ───────────────────────

  section('7. 冰河小鬼 / 冰鼬 · 免疫冰系')

  {
    const entry = { key: 'iceImmune', label: 't', names: ['Zombie'], module: 'm', methods: ['setFreeze'], mode: 'iceImmune' }

    // ① 两只目标僵尸的冰冻入口都被拦下
    for (const [id, name] of [[228, '冰鼬'], [229, '雪人小鬼']]) {
      const z = new FakeZombie({ ID: id })
      const { ctx, calls } = callCtx(z, [8, true])
      const r = T.handlerIceImmune(entry, z, [8, true], ctx.callNext)
      ok(r === undefined, `${name}（ID ${id}）被拦下，不会进入冻结`)
      ok(calls.length === 0, `${name} 的原 setFreeze 未执行`)
    }
    ok(T.stats.iceImmune === 2, '免疫计数 +2', String(T.stats.iceImmune))

    // ② 其它僵尸照常被冻
    const other = new FakeZombie({ ID: 1 })
    const c2 = callCtx(other, [8, true])
    const r2 = T.handlerIceImmune(entry, other, [8, true], c2.ctx.callNext)
    ok(c2.calls.length === 1 && r2 === 'NEXT', '其它僵尸照常冻结')

    // ③ 减速入口同样被拦
    const z3 = new FakeZombie({ ID: 228 })
    const c3 = callCtx(z3, [5])
    T.handlerIceImmune(entry, z3, [5], c3.ctx.callNext)
    ok(c3.calls.length === 0, 'setChill（减速）入口同样被拦')

    // ④ 异常安全
    const boom = new FakeZombie()
    Object.defineProperty(boom, 'ID', { get() { throw new Error('boom') } })
    let threw = false
    try { T.handlerIceImmune(entry, boom, [], callCtx(boom).ctx.callNext) } catch (e) { threw = true }
    ok(!threw, 'ID 读取抛错时不外泄')

    // ⑤ 挂载表：冰冻与减速两个入口各一条
    const ice = T.TARGETS.filter((t) => t.mode === 'iceImmune')
    ok(ice.length === 2, '冰冻与减速各一条挂载', String(ice.length))
    const methods = ice.map((t) => t.methods[0]).sort().join(',')
    ok(methods === 'setChill,setFreeze', '挂的是 setFreeze + setChill', methods)
    ok(T.ICE_IMMUNE_IDS.join(',') === '228,229', '免疫名单 = 冰鼬 228 + 雪人小鬼 229', T.ICE_IMMUNE_IDS.join(','))
  }

  // ─────────────────────── 3. 街机游戏机 ───────────────────────

  section('3. 街机 · 摘掉像素铁桶 + 召唤自扣')

  {
    const entry = find('arcadeSummon')
    const z = new FakeZombie({
      summonCD: 0.01,
      objdataOwn: {
        SummonnedZombies: [
          { Type: 'eighties_8bit' },
          { Type: 'eighties_8bit_armor1' },
          { Type: 'eighties_8bit_armor2' },
        ],
      },
    })
    const { ctx } = callCtx(z, [0.02])
    // 模拟引擎：本帧 CD 耗尽 → 召唤 → CD 重置为新的随机值
    ctx.callNext = () => { z.summonCD = 5; return 'NEXT' }
    T.handlerArcade(entry, z, [0.02], ctx.callNext)

    const pool = z.objdataOwn.SummonnedZombies.map((e) => e.Type)
    ok(!pool.includes('eighties_8bit_armor2'), '召唤池已摘掉像素铁桶', pool.join(','))
    ok(pool.length === 2, '其余两项保留', pool.join(','))
    ok(z.damageTaken.length === 1 && z.damageTaken[0] === T.CFG.arcadeSummonSelfHit,
      '召唤发生时自身扣血', JSON.stringify(z.damageTaken))
    ok(T.stats.arcadeSummons === 1, '召唤计数 +1')

    // 没到召唤点就不该扣血
    const z2 = new FakeZombie({ summonCD: 3, objdataOwn: { SummonnedZombies: [] } })
    const c2 = callCtx(z2, [0.02])
    c2.ctx.callNext = () => { z2.summonCD = 2.98; return 'NEXT' }
    T.handlerArcade(entry, z2, [0.02], c2.ctx.callNext)
    ok(z2.damageTaken.length === 0, 'CD 未耗尽时不扣血', JSON.stringify(z2.damageTaken))
  }

  // ─────────────────────── 4. 轮滑僵尸 ───────────────────────

  section('4. 轮滑（闪耀）· 地刺一击必杀')

  {
    const entry = find('glitterSpike')
    const z = new FakeZombie()
    const smashed = []
    const spikes = [{ normalSmash: (target) => smashed.push(target) }, { normalSmash: (target) => smashed.push(target) }]
    const { ctx, calls } = callCtx(z, [spikes])
    const r = T.handlerSpike(entry, z, [spikes], ctx.callNext)
    ok(z.playDieCalls === 1, '调用了 playDie（一击必杀）')
    ok(smashed.length === 2, '每个地刺都收到 normalSmash', String(smashed.length))
    ok(smashed.every((s) => s === z), 'normalSmash 收到的是这只僵尸')
    ok(r === undefined && calls.length === 0, '不调用原实现（避免二次判定）')
    ok(T.stats.spikeKills === 1, '秒杀计数 +1')
  }

  // ─────────────────────── 5. 霹雳舞僵尸 ───────────────────────

  section('5. 霹雳舞 · 一次只踢一只 + 自扣 50')

  {
    const entry = find('breakdancerKick')
    const leaps = []
    const mkTarget = (x) => {
      const t = { worldPositionX: x, leapBy: (...a) => leaps.push({ x, a }) }
      return t
    }
    const a = mkTarget(110)
    const b = mkTarget(115)
    const lane = makeLane({ zombies: [a, b] })
    const z = new FakeZombie({
      worldPositionX: 100,
      reversed: false,
      worldPositionY: lane.midY,
      inLane: lane,
      objdataOwn: { KickDistance: 2 },
    })
    z.zombieKickable = (t) => t === a || t === b

    const { ctx, calls } = callCtx(z)
    T.handlerKick(entry, z, [], ctx.callNext)

    ok(leaps.length === 1, '只踢出一只（原本会 forEach 全部）', `实际 ${leaps.length}`)
    ok(leaps[0].x === 110, '踢的是范围内第一只', String(leaps[0].x))
    ok(calls.length === 0, '拦截了原实现')
    ok(z.damageTaken.length === 1 && z.damageTaken[0] === 50, '踢中后自扣 50', JSON.stringify(z.damageTaken))
    ok(T.stats.kicks === 1, '踢击计数 +1')

    // 空踢：范围内没人 → 不应该自扣
    const lane2 = makeLane({ zombies: [] })
    const z2 = new FakeZombie({ worldPositionX: 100, inLane: lane2, objdataOwn: { KickDistance: 2 } })
    z2.zombieKickable = () => false
    const c2 = callCtx(z2)
    T.handlerKick(entry, z2, [], c2.ctx.callNext)
    ok(z2.damageTaken.length === 0, '空踢不自扣', JSON.stringify(z2.damageTaken))
  }

  // ─────────────────────── 6. 麦克说唱家 ───────────────────────

  section('6. 麦克说唱家 · 甩完麦自杀')

  {
    const entry = find('mcSelfKill')
    const handler = T.makeSelfHitAfter(entry)
    const z = new FakeZombie()
    const { ctx, calls } = callCtx(z)
    handler(z, [], ctx.callNext)
    ok(calls.length === 1, '原攻击实现照常执行（伤害照打）')
    ok(z.damageTaken.length === 1, '甩完之后自己挨了一下')
    ok(z.damageTaken[0] >= 999999, '那一下是致死伤害', String(z.damageTaken[0]))
    ok(z.dead === true, '僵尸已死亡')
    ok(T.stats.mcSuicides === 1, '自杀计数 +1')

    // 已经死了就不再结算第二次
    const z2 = new FakeZombie({ dead: true })
    const c2 = callCtx(z2)
    handler(z2, [], c2.ctx.callNext)
    ok(z2.damageTaken.length === 0, '已死亡的僵尸不重复结算')
  }

  // ─────────────────────── 8. 章鱼僵尸 ───────────────────────

  section('8. 章鱼僵尸 · 每次投掷自扣 150')

  {
    const entry = find('octopusSelfHit')
    const handler = T.makeSelfHitAfter(entry)
    const z = new FakeZombie()
    const { ctx, calls } = callCtx(z)
    handler(z, [], ctx.callNext)
    ok(calls.length === 1, '原投掷实现照常执行')
    ok(z.damageTaken.length === 1 && z.damageTaken[0] === 150,
      '每次投掷自扣 150', JSON.stringify(z.damageTaken))

    // 投两次扣两次（章鱼不是自杀型，不做存活判断）
    handler(z, [], ctx.callNext)
    ok(z.damageTaken.length === 2, '第二次投掷继续扣血', String(z.damageTaken.length))
  }

  // ─────────────────────── 7. 失落巨人 ───────────────────────

  section('9. 弄臣 · 旋转期间持续掉血')

  {
    const entry = find('jesterRotate')
    const z = new FakeZombie({ rotating: true })
    const { ctx } = callCtx(z, [1.0])
    T.handlerRotate(entry, z, [1.0], ctx.callNext)
    ok(z.damageTaken.length === 1, '旋转中掉血一次')
    ok(Math.abs(z.damageTaken[0] - 20) < 1e-9, '每秒 20 点', String(z.damageTaken[0]))

    // 按 dt 等比例（半秒掉 10）
    const z2 = new FakeZombie({ rotating: true })
    const c2 = callCtx(z2, [0.5])
    T.handlerRotate(entry, z2, [0.5], c2.ctx.callNext)
    ok(Math.abs(z2.damageTaken[0] - 10) < 1e-9, '半秒掉 10（按 dt 比例）', String(z2.damageTaken[0]))

    // 没在旋转就不掉
    const z3 = new FakeZombie({ rotating: false })
    const c3 = callCtx(z3, [1.0])
    T.handlerRotate(entry, z3, [1.0], c3.ctx.callNext)
    ok(z3.damageTaken.length === 0, '未旋转时不掉血')
  }

  section('11. 异常安全')

  {
    T.setRefs({ cc: null, Vec2: null, Rectangle: null, Square: null, ZombieDamageDetails: null, ZombieDamageType: null })
    const z = new FakeZombie()
    const modes = ['block', 'arcade', 'spike', 'kick', 'selfHitAfter', 'rotate']
    let threw = 0
    for (const mode of modes) {
      const entry = { key: 'octopusSelfHit', label: 't', names: ['X'], module: 'm', methods: ['m'], mode, hit: 'octopusThrowSelfHit' }
      try {
        const handler = T.makeHandler(entry)
        handler({ thisArg: z, args: [0.1], callNext: () => 'NEXT' })
      } catch (e) { threw += 1 }
    }
    ok(threw === 0, '依赖全缺时 8 种模式都不抛异常', `抛了 ${threw} 次`)

    // 恢复，别影响后面的断言
    T.setRefs(makeRefs())
  }
}
