(function initGoldSkillMap(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.UmaGoldSkillMap = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function goldSkillMapFactory() {
  "use strict";

  // Generated from the verified BWIKI Simplified Chinese skill snapshot
  // captured at 2026-08-01. A gold skill and its lower white skill share the
  // same group_id; when a group contains ○/◎ variants, the strongest positive
  // white variant is the direct lower skill.
  const SOURCE_URL = "https://wiki.biligame.com/umamusume/简中技能速查表";
  const SOURCE_SNAPSHOT = "2026-08-01";
  const GOLD_TO_WHITE = Object.freeze([{"groupId":20001,"gold":"顺时针恶煞","white":"顺时针◎"},{"groupId":20209,"gold":"气焰万丈","white":"斗争心"},{"groupId":20210,"gold":"情绪高涨","white":"积极向前"},{"groupId":20211,"gold":"破竹之势","white":"气势十足"},{"groupId":20212,"gold":"大胆无畏","white":"无畏之心"},{"groupId":20213,"gold":"狂暴旋风","white":"倾注气魄"},{"groupId":20215,"gold":"勇往直前","white":"马力全开"},{"groupId":20217,"gold":"顶级的下坡选手","white":"下坡能手"},{"groupId":20219,"gold":"专心致志","white":"滴水不漏"},{"groupId":20208,"gold":"起死回生","white":"一线胜机"},{"groupId":20226,"gold":"胜利的机运","white":"光明的征兆"},{"groupId":20228,"gold":"全速前进！","white":"猛冲"},{"groupId":20229,"gold":"明镜止水","white":"思路清晰"},{"groupId":20230,"gold":"优雅的沙浴","white":"沙浴○"},{"groupId":20231,"gold":"目标中心位！","white":"干劲十足"},{"groupId":20232,"gold":"狂奔模式！","white":"急速上升"},{"groupId":20233,"gold":"超群的迈步","white":"擅长迈步"},{"groupId":20234,"gold":"泥巴大师","white":"玩泥巴◎"},{"groupId":20235,"gold":"泥地上的舞姬","white":"扬尘"},{"groupId":20227,"gold":"卷土重来","white":"重整旗鼓"},{"groupId":20236,"gold":"大意轻敌","white":"压迫感"},{"groupId":20207,"gold":"泰然自若","white":"我行我素"},{"groupId":20203,"gold":"孤注一掷","white":"可疑的战术"},{"groupId":20148,"gold":"放学后的专家","white":"放学后的乐趣"},{"groupId":20149,"gold":"沉着冷静","white":"冷静"},{"groupId":20150,"gold":"知天命者","white":"策士"},{"groupId":20151,"gold":"炙热视线","white":"视线"},{"groupId":20156,"gold":"超级幸运7","white":"幸运7"},{"groupId":20159,"gold":"优俊少女狂热粉","white":"优俊少女爱好者"},{"groupId":20160,"gold":"磐石之势","white":"打基础"},{"groupId":20161,"gold":"尾巴跃龙门","white":"翘尾巴"},{"groupId":20204,"gold":"气势冲天","white":"轻快的步伐"},{"groupId":20165,"gold":"抢到好位置了！","white":"尾流"},{"groupId":20167,"gold":"热度飙升！","white":"人气股"},{"groupId":20168,"gold":"目标最前排！","white":"瞄准前排"},{"groupId":20169,"gold":"潜伏状态","white":"平静的呼吸"},{"groupId":20170,"gold":"拼死决心","white":"不遗余力"},{"groupId":20190,"gold":"短兵相接","white":"正面较量"},{"groupId":20200,"gold":"沙尘行家","white":"适应沙尘"},{"groupId":20201,"gold":"真打","white":"影打"},{"groupId":20202,"gold":"强攻策略","white":"率先发力"},{"groupId":20166,"gold":"先走一步！","white":"游戏到此为止！"},{"groupId":20147,"gold":"视野良好！没有异常！","white":"看穿"},{"groupId":20237,"gold":"势不可挡","white":"进攻姿态"},{"groupId":20239,"gold":"输出1000%！","white":"拼尽全力"},{"groupId":20266,"gold":"激昂的心跳","white":"翻涌的热情"},{"groupId":20267,"gold":"斗志高昂","white":"心情雀跃"},{"groupId":20268,"gold":"情绪☆嗨爆↑","white":"情绪提升"},{"groupId":20269,"gold":"奔向最前方！","white":"拔得头筹"},{"groupId":20270,"gold":"奇点","white":"探求心"},{"groupId":20271,"gold":"将军","white":"关键一步"},{"groupId":20272,"gold":"永不言弃","white":"坚定之心"},{"groupId":20273,"gold":"隆尚奇才","white":"隆尚赛场◎"},{"groupId":20265,"gold":"云蒸龙变","white":"自信十足"},{"groupId":21001,"gold":"燃烧青春·速","white":"点燃青春·速"},{"groupId":21003,"gold":"燃烧青春·力","white":"点燃青春·力"},{"groupId":21004,"gold":"燃烧青春·毅","white":"点燃青春·毅"},{"groupId":21005,"gold":"燃烧青春·智","white":"点燃青春·智"},{"groupId":21006,"gold":"启明星","white":"闪耀之星"},{"groupId":21007,"gold":"想与你一同取胜","white":"追梦途中"},{"groupId":21008,"gold":"超越极限","white":"专注前方"},{"groupId":21026,"gold":"太阳的睿智","white":"阳之庇佑"},{"groupId":21027,"gold":"大海的睿智","white":"海之庇佑"},{"groupId":21002,"gold":"燃烧青春·耐","white":"点燃青春·耐"},{"groupId":20238,"gold":"突破","white":"破局之策"},{"groupId":20264,"gold":"千里之行","white":"始于足下"},{"groupId":20260,"gold":"冷发光","white":"点火"},{"groupId":20240,"gold":"电光石火","white":"飞跃而上"},{"groupId":20241,"gold":"风云之志","white":"上进心"},{"groupId":20242,"gold":"浑然忘我","white":"不顾一切"},{"groupId":20243,"gold":"气势如虹","white":"步伐稳健"},{"groupId":20244,"gold":"博弈者","white":"投机取巧"},{"groupId":20245,"gold":"最高档位","white":"锐利脚步"},{"groupId":20246,"gold":"绝影","white":"坚韧不拔"},{"groupId":20247,"gold":"猛追","white":"紧追不放"},{"groupId":20262,"gold":"突击之魂","white":"开始行动"},{"groupId":20248,"gold":"怪物","white":"大展身手"},{"groupId":20250,"gold":"奋不顾身","white":"不计后果"},{"groupId":20252,"gold":"天衣无缝","white":"特立独行"},{"groupId":20253,"gold":"建立优势","white":"优雅步伐"},{"groupId":20254,"gold":"威风堂堂","white":"压力"},{"groupId":20255,"gold":"神速","white":"快速"},{"groupId":20256,"gold":"一击必中","white":"锁定"},{"groupId":20258,"gold":"超越脱兔","white":"目不斜视"},{"groupId":20259,"gold":"一气呵成","white":"十万火急"},{"groupId":20249,"gold":"超群的犀利步伐","white":"犀利步伐"},{"groupId":20145,"gold":"月影一闪","white":"后追直线◎"},{"groupId":20144,"gold":"紧盯八方","white":"锐利目光"},{"groupId":20143,"gold":"大局观","white":"观察能力"},{"groupId":20054,"gold":"逃脱术","white":"疾步"},{"groupId":20055,"gold":"逃亡者","white":"准备压制"},{"groupId":20056,"gold":"游刃有余","white":"保留体力"},{"groupId":20057,"gold":"比赛策略家","white":"稳步紧追"},{"groupId":20058,"gold":"速度之星","white":"准备突围"},{"groupId":20059,"gold":"迅速果断","white":"向前抢位"},{"groupId":20060,"gold":"换乘能手","white":"超越架势"},{"groupId":20061,"gold":"登天之龙","white":"准备外道超越"},{"groupId":20053,"gold":"先发制人","white":"抢先"},{"groupId":20062,"gold":"沉睡的狮子","white":"后方待机"},{"groupId":20064,"gold":"迫近的暗影","white":"一鼓作气"},{"groupId":20065,"gold":"短途涡轮","white":"短途齿轮"},{"groupId":20067,"gold":"电击光辉","white":"逼近"},{"groupId":20068,"gold":"英里统治者","white":"积极行动"},{"groupId":20069,"gold":"慧眼","white":"窥视展开"},{"groupId":20070,"gold":"奋力一搏","white":"上升气流"},{"groupId":20071,"gold":"开拓者","white":"前途似锦"},{"groupId":20072,"gold":"绝妙韵律","white":"加快节奏"},{"groupId":20063,"gold":"疾风怒涛","white":"超群冲刺"},{"groupId":20073,"gold":"对胜利的执念","white":"紧追不舍"},{"groupId":20051,"gold":"全神贯注","white":"最后冲刺"},{"groupId":20049,"gold":"不停步的女孩","white":"回避失速优俊少女"},{"groupId":20006,"gold":"淀之奇才","white":"京都赛场◎"},{"groupId":20015,"gold":"良场地恶煞","white":"良场地◎"},{"groupId":20016,"gold":"不佳路况恶煞","white":"路况不佳◎"},{"groupId":20017,"gold":"春初暖风","white":"春季优俊少女◎"},{"groupId":20018,"gold":"初夏疾风","white":"夏季优俊少女◎"},{"groupId":20019,"gold":"秋初强风","white":"秋季优俊少女◎"},{"groupId":20033,"gold":"弧线大师","white":"弯道能手○"},{"groupId":20034,"gold":"曲线行家","white":"弯道加速○"},{"groupId":20050,"gold":"赛道的魔术师","white":"临机应变"},{"groupId":20035,"gold":"圆弧艺术家","white":"弯道恢复○"},{"groupId":20037,"gold":"一阵狂风","white":"直线加速"},{"groupId":20038,"gold":"喘口气","white":"直线恢复"},{"groupId":20043,"gold":"专心一意","white":"专注力"},{"groupId":20044,"gold":"钢铁意志","white":"隐身衣"},{"groupId":20045,"gold":"人气舞娘","white":"位置感"},{"groupId":20046,"gold":"兴奋起来了！","white":"加快步伐"},{"groupId":20047,"gold":"不屈之心","white":"保持步伐"},{"groupId":20048,"gold":"耳边风","white":"临危不乱"},{"groupId":20036,"gold":"迅疾如风","white":"直线能手"},{"groupId":20074,"gold":"冷却","white":"深呼吸"},{"groupId":20075,"gold":"内侧体验","white":"弯里横"},{"groupId":20076,"gold":"破釜沉舟","white":"大胃储备"},{"groupId":20121,"gold":"怒涛般的追击","white":"追击"},{"groupId":20122,"gold":"掠夺体力","white":"吞噬体力"},{"groupId":20123,"gold":"奇术师","white":"障眼法"},{"groupId":20125,"gold":"阵风圆刃","white":"领跑弯道◎"},{"groupId":20126,"gold":"第六感","white":"危险回避"},{"groupId":20127,"gold":"领跑者","white":"领跑的骄傲"},{"groupId":20128,"gold":"活泼优俊少女","white":"随势而动"},{"groupId":20129,"gold":"再度燃烧","white":"第二支箭"},{"groupId":20120,"gold":"VIP熟客","white":"赶超能手"},{"groupId":20133,"gold":"技巧派","white":"轻巧舞步"},{"groupId":20135,"gold":"大胃王","white":"营养补给"},{"groupId":20136,"gold":"不屈的精神","white":"重振旗鼓"},{"groupId":20137,"gold":"迷惑干扰","white":"干扰"},{"groupId":20138,"gold":"锐脚一闪","white":"居中直线◎"},{"groupId":20139,"gold":"锐脚圆刃","white":"居中弯道◎"},{"groupId":20140,"gold":"努力家","white":"努力者"},{"groupId":20141,"gold":"百万马力","white":"十万马力"},{"groupId":20142,"gold":"放松","white":"稍作休息"},{"groupId":20134,"gold":"决心的直线下坡","white":"直线下坡"},{"groupId":20119,"gold":"领头心得","white":"保持领先"},{"groupId":20117,"gold":"烈风一闪","white":"长距离直线◎"},{"groupId":20116,"gold":"魅惑低语","white":"低语"},{"groupId":20077,"gold":"吸睛诡计","white":"诡计（前）"},{"groupId":20096,"gold":"紫电一闪","white":"短距离直线◎"},{"groupId":20098,"gold":"压倒性领先","white":"遥遥领先"},{"groupId":20099,"gold":"X计划","white":"善后措施"},{"groupId":20100,"gold":"万事俱备！","white":"准备冲刺"},{"groupId":20101,"gold":"迷魂术","white":"钉牢后方"},{"groupId":20102,"gold":"逃亡禁令","white":"禁止抢先"},{"groupId":20104,"gold":"豪风圆刃","white":"英里弯道◎"},{"groupId":20105,"gold":"换挡","white":"变速"},{"groupId":20106,"gold":"马力全开！","white":"加快速度"},{"groupId":20107,"gold":"大姐头气质","white":"要强"},{"groupId":20108,"gold":"掠夺速度","white":"吞噬速度"},{"groupId":20109,"gold":"布阵","white":"布局"},{"groupId":20110,"gold":"瞬息万变","white":"中距离直线◎"},{"groupId":20111,"gold":"光芒圆刃","white":"中距离弯道◎"},{"groupId":20112,"gold":"千里眼","white":"鹰眼"},{"groupId":20113,"gold":"闪光步伐","white":"闪电步伐"},{"groupId":20114,"gold":"神迹步伐","white":"轻盈步伐"},{"groupId":20115,"gold":"独占力","white":"束缚"},{"groupId":21028,"gold":"大地的睿智","white":"地之庇佑"},{"groupId":21029,"gold":"巅峰之梦","white":"背负信念"}]);

  function factorName(factor) {
    return String(factor?.name ?? factor?.factor_name ?? "").trim();
  }

  function buildGoldSkillFactors(factors) {
    const liveFactors = Array.isArray(factors) ? factors : [];
    const whiteSkillsByName = new Map(
      liveFactors
        .filter((factor) => Number(factor?.type) === 4)
        .map((factor) => [factorName(factor), factor])
        .filter(([name]) => name)
    );
    const virtual = [];
    for (const mapping of GOLD_TO_WHITE) {
      const lower = whiteSkillsByName.get(mapping.white);
      if (!lower) continue;
      virtual.push({
        ...lower,
        name: mapping.gold,
        key: `gold:${mapping.groupId}`,
        catalogKey: `gold:${mapping.groupId}`,
        virtualGold: true,
        goldSkillName: mapping.gold,
        lowerSkillName: mapping.white,
        source: "BWIKI",
        sourceUrl: SOURCE_URL
      });
    }
    return virtual;
  }

  function extendFactorCatalog(factors) {
    const liveFactors = Array.isArray(factors) ? factors : [];
    return [...liveFactors, ...buildGoldSkillFactors(liveFactors)];
  }

  return {
    SOURCE_URL,
    SOURCE_SNAPSHOT,
    GOLD_TO_WHITE,
    buildGoldSkillFactors,
    extendFactorCatalog
  };
});

