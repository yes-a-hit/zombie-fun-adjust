/**
 * 交付物一致性断言：清单字段、小鬼血量补丁、许可与声明。
 * 默认校验仓库根；设置 JBTMG_PKG_ROOT 后可校验任意解包目录（用于验证发布的 ZIP）。
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { ok, section } from './harness.mjs'

export function runPackage({ pkgRoot }) {
  section('E. 包内容一致性')
  console.log(`  （校验目录：${pkgRoot}）`)

  const at = (rel) => path.join(pkgRoot, rel)

  // ── 清单 ──
  const packJson = JSON.parse(readFileSync(at('pack.json'), 'utf8'))
  ok(packJson.uuid === 'yg.zombie-fun-adjust', 'uuid 正确', packJson.uuid)
  ok(packJson.version === '1.4.3', 'version = 1.4.3', packJson.version)
  ok(/（22 条）/.test(packJson.description), '描述标注为 22 条')
  ok(!/国王可被拦截|运兵艇|墓碑/.test(packJson.description),
    '描述里不含已撤销 / 做不到的功能（国王拦截、运兵艇、巨人墓碑）',
    packJson.description.slice(0, 40))
  ok(packJson.apiVersion === 2, 'apiVersion = 2')
  ok(packJson.js && packJson.js.startup === true, 'js.startup = true（engine 访问权前提）')
  ok(!('requiredGpNextFeatures' in packJson), '未声明 requiredGpNextFeatures（本版本会拒绝加载）')
  ok(packJson.js.entry === 'scripts/main.js', 'js.entry 指向 scripts/main.js')
  ok(packJson.author === 'YG', 'author 正确')
  ok(!('depends' in packJson) && !('optionalDepends' in packJson), '无额外前置依赖')

  // ── 数据补丁：小鬼血量 ──
  const props = JSON.parse(readFileSync(at('jsons/objects/ZombieProps.json'), 'utf8'))
  const impEntries = props.objects.filter((o) => o.objdata && o.objdata.Toughness !== undefined && o.aliases[0] !== 'sky_dropship')
  const bugEntries = props.objects.filter((o) => o.objdata && o.objdata.BugToughness !== undefined)
  ok(props.objects.length === 25, '血量补丁共 25 条（18 小鬼 + 7 蜻蜓/萤火虫护甲）', String(props.objects.length))
  ok(props.objects.every((o) => o.objclass === 'ZombieProperties'), 'objclass 全部为 ZombieProperties')
  ok(impEntries.length === 18 && impEntries.every((o) => o.objdata.Toughness === 95),
    '18 条小鬼全部 Toughness = 95',
    JSON.stringify(impEntries.filter((o) => o.objdata.Toughness !== 95).map((o) => o.aliases[0])))
  ok(bugEntries.length === 7 && bugEntries.every((o) => o.objdata.BugToughness === 90),
    '7 条蜻蜓/萤火虫护甲全部 BugToughness = 90（原 350）',
    JSON.stringify(bugEntries.map((o) => `${o.aliases[0]}=${o.objdata.BugToughness}`)))

  // ── 数据补丁：植物（魔音甜菜防踢飞）──
  const pprops = JSON.parse(readFileSync(at('jsons/objects/PlantProps.json'), 'utf8'))
  ok(pprops.objects.length === 2, '植物补丁 2 条（魔音甜菜 + 音游甜菜）', String(pprops.objects.length))
  ok(pprops.objects.every((o) => o.objclass === 'PlantProperties'), 'objclass 全部为 PlantProperties')
  ok(pprops.objects.every((o) => o.objdata.CannotBePushedByFootballMech === true),
    '魔音甜菜系列已加入防踢飞字段（与白萝卜 turnip 同一字段）',
    JSON.stringify(pprops.objects.map((o) => o.aliases[0])))

  const names = props.objects.map((o) => o.aliases[0])
  const mustHave = ['tutorial_imp', 'egypt_imp', 'future_imp', 'lostcity_imp', 'dino_imp', 'sky_imp']
  for (const n of mustHave) ok(names.includes(n), `名单含 ${n}`)
  ok(new Set(names).size === names.length, '补丁里没有重复条目')
  ok(props.objects.every((o) => Array.isArray(o.aliases) && o.aliases.length === 1),
    '每条只有一个 alias（gp-next 按 aliases[0] 定位）')

  // ── 许可与声明 ──
  ok(existsSync(at('LICENSE')), 'LICENSE 存在')
  ok(existsSync(at('NOTICE.md')), 'NOTICE.md 存在')

  const license = readFileSync(at('LICENSE'), 'utf8')
  ok(license.startsWith('MIT License'), 'LICENSE 以标准标题开头')
  ok(license.includes('Copyright (c) 2026 YG'), 'LICENSE 含版权行')
  ok(license.trim().endsWith('SOFTWARE.'), 'LICENSE 以标准 MIT 全文结尾，未追加附加条款')

  const notice = readFileSync(at('NOTICE.md'), 'utf8')
  ok(notice.includes('不含任何第三方模组代码'), 'NOTICE 声明不含第三方模组代码')
  ok(notice.includes('互操作'), 'NOTICE 说明游戏数据的互操作性边界')
  ok(notice.includes('商标'), 'NOTICE 覆盖商标归属')

  // ── 文档口径 ──
  const readme = readFileSync(at('README.md'), 'utf8')
  ok(readme.includes('22 条'), 'README 改动一览标注为 22 条')
  ok(!/国王可被拦截|运兵艇|巨人墓碑/.test(readme),
    'README 描述里不含已撤销 / 做不到的功能')
  ok(readme.includes('国王'), 'README 含国王相关条目')
  ok(readme.includes('NOTICE.md'), 'README 指向 NOTICE.md')
  ok(readme.includes('DSH') && readme.includes('DeepSeek V4.1f'),
    'README 声明了 DSH 与 DeepSeek V4.1f 的协作开发')
  ok(readme.includes('不需要任何额外脚本'), 'README 明确说明无需额外脚本')
  ok(!/fix-mod-startup|点\s*bat/i.test(readme), 'README 不含「点 bat」式安装指引')

  const installPath = at('docs/INSTALL.md')
  if (existsSync(installPath)) {
    const install = readFileSync(installPath, 'utf8')
    ok(!/fix-mod-startup|点\s*bat|回来找作者/i.test(install), 'INSTALL.md 不含「点 bat / 回来找作者」式指引')
    ok(install.includes('不需要任何额外脚本'), 'INSTALL.md 明确说明无需额外脚本')
    ok(install.includes('与本模组无关'), 'INSTALL.md 把 afterProject 归因到环境而非本模组')
  }

  // ── 1.3.0：三巨头改名 + 图鉴重写 ──
  const feat = JSON.parse(readFileSync(at('jsons/features/ZombieFeatures.json'), 'utf8'))
  const zNames = Object.fromEntries((feat.ZOMBIES || []).map((z) => [z.CODENAME, z.NAME]))
  ok(zNames.kongfu_boss_explode && zNames.kongfu_boss_explode.zh === '万户' && zNames.kongfu_boss_explode.en === 'Wan Hu',
    '火药魔头 → 万户 / Wan Hu', JSON.stringify(zNames.kongfu_boss_explode))
  ok(zNames.kongfu_boss_blade && zNames.kongfu_boss_blade.zh === '李逵', '持刀大侠 → 李逵', JSON.stringify(zNames.kongfu_boss_blade))
  ok(zNames.kongfu_boss_chi && zNames.kongfu_boss_chi.zh === '张角', '气功教主 → 张角', JSON.stringify(zNames.kongfu_boss_chi))

  const al = JSON.parse(readFileSync(at('jsons/objects/ZombieAlmanac.json'), 'utf8'))
  ok(al.objects.length === 43, '图鉴补丁 43 条（1.3.0 的 33 条 + 1.4.0 的 10 条）', String(al.objects.length))
  const aliasSeen = new Set()
  let dup = null
  for (const o of al.objects) {
    if (aliasSeen.has(o.aliases[0])) dup = o.aliases[0]
    aliasSeen.add(o.aliases[0])
  }
  ok(dup === null, '同一 codename 不出现两次（避免后者覆盖前者）', String(dup))
  const byCn = Object.fromEntries(al.objects.map((o) => [o.aliases[0], o.objdata]))
  ok(/苍天已死/.test(JSON.stringify(byCn.kongfu_boss_chi)), '张角图鉴含「苍天已死，黄天当立」')
  for (const cn of ['kongfu_boss_explode', 'kongfu_boss_blade', 'kongfu_boss_chi', 'dark_king', 'dark_king_veteran', 'eighties_gargantuar']) {
    const d = byCn[cn] || {}
    ok(d.Introduction && d.Introduction.zh && d.Introduction.en && d.Chat && d.Chat.zh && d.Chat.en,
      `${cn} 图鉴三块齐全且中英双语`)
    ok(Array.isArray(d.Special) && d.Special.length >= 1, `${cn} 至少一条 Special`)
  }
  const gargSpecial = (byCn.eighties_gargantuar && byCn.eighties_gargantuar.Special) || []
  ok(!gargSpecial.some((s) => /音波/.test(JSON.stringify(s)) && !/不再|no longer/i.test(JSON.stringify(s))),
    '重金属巨尸图鉴里不存在「仍会发波」的攻击条目',
    JSON.stringify(gargSpecial.map((s) => s.DESCRIPTION && s.DESCRIPTION.zh)))
  const kidCount = al.objects.filter((o) => Array.isArray(o.objdata.Special)
    && o.objdata.Special.some((s) => s.NAME && s.NAME.en === 'Update')).length
  ok(kidCount === 17, '17 只小鬼各追加了一条「更新」档案', String(kidCount))

  const nar = JSON.parse(readFileSync(at('jsons/objects/NarrativeList.json'), 'utf8'))
  const narAll = JSON.stringify(nar)
  ok(!/火药魔头|持刀大侠|气功教主/.test(narAll), '剧情里不再出现旧名')
  ok(/万户/.test(narAll) && /李逵/.test(narAll) && /张角/.test(narAll), '剧情已换用新名')
  ok(/苍天已死，黄天当立/.test(narAll), '张角出场剧情含「苍天已死，黄天当立」')

  // ── 1.4.0：四组新特性的结构断言 ──
  const feat2 = JSON.parse(readFileSync(at('jsons/features/ZombieFeatures.json'), 'utf8'))
  const nameMap = Object.fromEntries((feat2.ZOMBIES || []).map((z) => [z.CODENAME, z.NAME]))
  ok(nameMap.lostcity_crystalskull && nameMap.lostcity_crystalskull.zh === '老爹'
    && nameMap.lostcity_crystalskull.en === 'Uncle', '青骷髅头 → 老爹 / Uncle',
    JSON.stringify(nameMap.lostcity_crystalskull))

  const al2 = JSON.parse(readFileSync(at('jsons/objects/ZombieAlmanac.json'), 'utf8'))
  const byCn2 = Object.fromEntries(al2.objects.map((o) => [o.aliases[0], o.objdata]))
  ok(/诺克萨斯|处决/.test(JSON.stringify(byCn2.dark_gargantuar)), '黑暗巨尸图鉴写了「诺克萨斯断头台」梗')
  ok(/哎呀呀|还有一件事|魔法/.test(JSON.stringify(byCn2.lostcity_crystalskull)), '老爹图鉴写了他的口头禅')
  ok(/空军/.test(JSON.stringify(byCn2.beach_fisherman)), '渔夫图鉴带「空军」类描述')
  for (const cn of ['future_gargantuar', 'catapult', 'zomboni', 'sky_twin']) {
    ok(/4|四|爆头/.test(JSON.stringify((byCn2[cn] || {}).Special)) && byCn2[cn] && byCn2[cn].Chat,
      `${cn} 图鉴写了 4 倍 / 爆头`)
  }
  for (const cn of ['newspaper', 'newspaper_veteran', 'camel_onehump']) {
    ok(byCn2[cn] && /地刺|电|投掷/.test(JSON.stringify(byCn2[cn].Special)), `${cn} 图鉴写了二类防具`)
  }
}

