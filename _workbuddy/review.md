严重·数据覆盖 | jsons\objects\ZombieAlmanac.json（iceage_imp 第 26 条、sky_imp 第 34 条） | 同一 alias 各出现两次，后一条只有 Special 一句小鬼档案、没有 Introduction/Chat，按 alias 取用时后条覆盖前条，会丢掉「完全免疫冰冻与减速」「血量 95」「脉冲黄桃瘫痪坠地」以及整段图鉴介绍与闲聊 | 把这两句档案并入原条目的 Special 末尾，删掉重复对象（tests\suite-package.mjs 用 Object.fromEntries 按 alias 取，等于已经踩中后者胜）
严重·缺条目 | jsons\objects\ZombieAlmanac.json | sportzball_imp（足球小鬼）完全没有条目，_workbuddy\batch4.json 里写了它的档案，README 写「18 只小鬼各有一句档案」；tests\suite-package.mjs 反而把期望值写成 17 | 补一条 sportzball_imp 的 Special（NAME=更新/Update），测试期望改回 18
中·表述不符 | README.md L52-53 | 写「被改动过的 18 只僵尸……`特点` 里多一条「更新」说明」；实测被改动的 18 只（含三巨头）新增条 NAME 全是「特点/Special」，NAME 为「更新/Update」的只有 17 只小鬼，两类被并成一句 | 分开写：15 只改动僵尸 + 3 只三巨头加「特点」说明，18 只小鬼加「更新」档案
中·表述不符 | README.md L56-58 | 写小鬼档案「会出现在各自图鉴的「特点」末尾」；实际是独立重复对象整条覆盖，不是末尾追加，iceage_imp/sky_imp 还因此丢了原条目 | 与第 1 条一起修，措辞改成「并入该僵尸「特点」末尾」
中·重复 | jsons\objects\ZombieAlmanac.json（kongfu_boss_chi） | 「苍天已死，黄天当立」在同一条目出现 3 次（Introduction、Special、Chat），加上 batch4 的称号共 4 次，口号变复读 | Introduction 保留原句，Special 改述为「那句口号」，Chat 保留一处即可
中·冲突 | _workbuddy\batch1.json 与 _workbuddy\batch4.json | 三巨头各出现两套不同称号：batch1「三把手，第一个离地的人／二把手，两把板斧／一把手，与那八个字」vs batch4「第一个想上天的人／两把板斧，一把在飞／苍天已死，黄天当立」 | 定一套为准，另一套删除或只保留英文版
低·重复 | _workbuddy\batch4.json（kongfu_boss_chi.title） | 称号直接照抄整句口号，与图鉴三处重复，作为副标题没有增量信息 | 改成呼应而非照抄，例如「黄天当立的那一位」
低·易误读 | jsons\objects\ZombieAlmanac.json（iceage_imp 小鬼档案） | 「太阳先拿走他一半」容易被读成太阳会伤害他，本次改动只涉及血量变脆与冰冻免疫，等于凭空引入一个不存在的机制 | 换成与雪人身份、冰冻免疫相关的说法
低·史实存疑 | README.md L46 | 「明代人，人类第一个想靠火箭上天的人」——万户的朝代有元末明初之争，学界无定论，「明代」是通行说法但不宜写死 | 改为「明代（一说元末）」
