/**
 * Pixel Snake · Product shell (hub / achievements / skins / story)
 */
(function () {
  "use strict";

  var META_KEY = "pixel-snake-meta-v1";
  var SKIN_KEY = "pixel-snake-skin-v1";

  var ACHIEVEMENTS = [
    { id: "first_bite", title: "第一口", desc: "吃到第 1 个苹果", icon: "🍎" },
    { id: "score_50", title: "热身", desc: "单局得分达到 50", icon: "✨" },
    { id: "score_100", title: "百分流", desc: "单局得分达到 100", icon: "💯" },
    { id: "score_200", title: "霓虹猎手", desc: "单局得分达到 200", icon: "🏆" },
    { id: "level_3", title: "压力上来了", desc: "到达第 3 关", icon: "📶" },
    { id: "power_collector", title: "拾荒者", desc: "捡起任意道具", icon: "🎁" },
    { id: "devil_deal", title: "契约", desc: "使用恶魔果实换命", icon: "😈" },
    { id: "loan_shark", title: "贷款蛇", desc: "分数变成负数", icon: "📉" },
    { id: "ghost_walk", title: "穿身", desc: "使用幽灵", icon: "👻" },
    { id: "bomber", title: "清场", desc: "使用炸弹", icon: "💣" },
    { id: "two_lives", title: "备胎", desc: "同时拥有 2 条命以上", icon: "❤️" },
  ];

  var SKINS = [
    {
      id: "cyan",
      name: "经典青",
      unlock: null,
      head: "#00f0ff",
      headHi: "#a8ffff",
      body: function (t) {
        var g = Math.floor(40 + (1 - t) * 180);
        return "rgb(0," + g + "," + Math.min(255, g + 40) + ")";
      },
    },
    {
      id: "magenta",
      name: "品红霓虹",
      unlock: "score_100",
      head: "#ff2bd6",
      headHi: "#ff9ae8",
      body: function (t) {
        var g = Math.floor(60 + (1 - t) * 160);
        return "rgb(" + Math.min(255, g + 80) + ",40," + Math.min(255, g + 40) + ")";
      },
    },
    {
      id: "toxic",
      name: "毒液绿",
      unlock: "level_3",
      head: "#39ff14",
      headHi: "#b8ff9a",
      body: function (t) {
        var g = Math.floor(50 + (1 - t) * 170);
        return "rgb(20," + Math.min(255, g + 40) + ",40)";
      },
    },
    {
      id: "gold",
      name: "金牌蛇",
      unlock: "score_200",
      head: "#ffd700",
      headHi: "#fff3a8",
      body: function (t) {
        var g = Math.floor(80 + (1 - t) * 140);
        return "rgb(" + Math.min(255, g + 60) + "," + Math.floor(g * 0.75) + ",20)";
      },
    },
    {
      id: "ghostly",
      name: "幽灵灰",
      unlock: "ghost_walk",
      head: "#c5cdd8",
      headHi: "#ffffff",
      body: function (t) {
        var g = Math.floor(70 + (1 - t) * 120);
        return "rgb(" + g + "," + Math.floor(g * 1.05) + "," + Math.min(255, g + 30) + ")";
      },
    },
  ];

  var STORY = [
    {
      id: "ch1",
      title: "第一章 · 霓虹果园",
      unlockAch: null,
      requiresClear: null,
      difficulty: "easy",
      goal: { type: "score", value: 40 },
      goalText: "得分达到 40",
      body:
        "传说城市地下有一座永不熄灯的果园。苹果会自己发光，蛇则靠吞噬光亮活下去。你不是第一条进去的蛇——只是还没死掉的那条。",
    },
    {
      id: "ch2",
      title: "第二章 · 契约贩子",
      unlockAch: "score_50",
      requiresClear: "ch1",
      difficulty: "normal",
      goal: { type: "score", value: 80 },
      goalText: "得分达到 80",
      body:
        "果园深处漂着紫色的「恶魔果实」。它不给人力量，只做买卖：用你的分数换一条命。账可以赊，利息写在皮肤上——分数会变成红色。",
    },
    {
      id: "ch3",
      title: "第三章 · 压力层",
      unlockAch: "level_3",
      requiresClear: "ch2",
      difficulty: "normal",
      goal: { type: "level", value: 3 },
      goalText: "到达第 3 关",
      body:
        "关卡越高，铁刺障碍越密。有人说那是果园的免疫系统。也有人说，那只是上一条蛇留下的骨头。",
    },
    {
      id: "ch4",
      title: "第四章 · 猎手徽章",
      unlockAch: "score_200",
      requiresClear: "ch3",
      difficulty: "hell",
      goal: { type: "score", value: 150 },
      goalText: "得分达到 150（地狱）",
      body:
        "当你的光亮攒到足够刺眼，果园会记住你的颜色。金牌蛇不是称号——是通行证。至于出口在哪，还没蛇回来说过。",
    },
  ];

  function loadMeta() {
    try {
      var raw = localStorage.getItem(META_KEY);
      if (!raw) return { unlocked: {}, seenStory: {}, chaptersCleared: {} };
      var data = JSON.parse(raw);
      return {
        unlocked: data.unlocked || {},
        seenStory: data.seenStory || {},
        chaptersCleared: data.chaptersCleared || {},
      };
    } catch (e) {
      return { unlocked: {}, seenStory: {}, chaptersCleared: {} };
    }
  }

  function saveMeta() {
    try {
      localStorage.setItem(
        META_KEY,
        JSON.stringify({
          unlocked: meta.unlocked,
          seenStory: meta.seenStory,
          chaptersCleared: meta.chaptersCleared,
        })
      );
    } catch (e) {}
  }

  var meta = loadMeta();
  var skinId = "cyan";
  try {
    skinId = localStorage.getItem(SKIN_KEY) || "cyan";
  } catch (e) {}

  function $(id) {
    return document.getElementById(id);
  }

  function isDevMode() {
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.get("dev") === "1" || q.get("debug") === "1") return true;
      if (localStorage.getItem("pixel-snake-dev") === "1") return true;
    } catch (e) {}
    return false;
  }

  function setHidden(el, hide) {
    if (!el) return;
    if (hide) {
      el.setAttribute("hidden", "");
      el.classList.add("hidden");
    } else {
      el.removeAttribute("hidden");
      el.classList.remove("hidden");
    }
  }

  function isUnlocked(achId) {
    return !!(achId && meta.unlocked[achId]);
  }

  function skinUnlocked(skin) {
    if (!skin.unlock) return true;
    return isUnlocked(skin.unlock);
  }

  function getSkin() {
    var found = null;
    for (var i = 0; i < SKINS.length; i++) {
      if (SKINS[i].id === skinId) found = SKINS[i];
    }
    if (!found || !skinUnlocked(found)) return SKINS[0];
    return found;
  }

  function toastUnlock(ach) {
    var el = $("toast");
    if (!el) return;
    el.textContent = "成就解锁 · " + ach.title;
    el.className = "toast toast-ok";
    void el.offsetWidth;
    setTimeout(function () {
      el.classList.add("hidden");
    }, 1400);
  }

  function unlock(id) {
    if (!id || meta.unlocked[id]) return false;
    var ach = null;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      if (ACHIEVEMENTS[i].id === id) ach = ACHIEVEMENTS[i];
    }
    if (!ach) return false;
    meta.unlocked[id] = Date.now();
    saveMeta();
    toastUnlock(ach);
    renderAchievements();
    renderSkins();
    renderStory();
    return true;
  }

  function showHub() {
    document.body.classList.add("hub-open");
    setHidden($("hub"), false);
    showHubHome();
    var g = window.PixelSnakeGame;
    if (g && g.returnToHub) g.returnToHub();
  }

  function hideHub() {
    document.body.classList.remove("hub-open");
    setHidden($("hub"), true);
  }

  function isHubOpen() {
    return document.body.classList.contains("hub-open");
  }

  function showHubHome() {
    setHidden($("hubHome"), false);
    setHidden($("hubAchievements"), true);
    setHidden($("hubSkins"), true);
    setHidden($("hubStory"), true);
  }

  function openPanel(name) {
    setHidden($("hubHome"), true);
    setHidden($("hubAchievements"), name !== "achievements");
    setHidden($("hubSkins"), name !== "skins");
    setHidden($("hubStory"), name !== "story");
    if (name === "achievements") renderAchievements();
    if (name === "skins") renderSkins();
    if (name === "story") renderStory();
  }

  function renderAchievements() {
    var list = $("hubAchievementsList");
    if (!list) return;
    var html = "";
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      var on = isUnlocked(a.id);
      html +=
        '<li class="hub-item' +
        (on ? " is-on" : "") +
        '"><span class="hub-item-icon">' +
        a.icon +
        '</span><div><div class="hub-item-title">' +
        a.title +
        (on ? " · 已解锁" : " · 未解锁") +
        '</div><div class="hub-item-desc">' +
        a.desc +
        "</div></div></li>";
    }
    list.innerHTML = html;
  }

  function renderSkins() {
    var list = $("hubSkinsList");
    if (!list) return;
    var html = "";
    for (var i = 0; i < SKINS.length; i++) {
      var s = SKINS[i];
      var on = skinUnlocked(s);
      var selected = getSkin().id === s.id;
      var need = "";
      if (s.unlock) {
        for (var j = 0; j < ACHIEVEMENTS.length; j++) {
          if (ACHIEVEMENTS[j].id === s.unlock) need = ACHIEVEMENTS[j].title;
        }
      }
      html +=
        '<li class="hub-item hub-skin' +
        (on ? " is-on" : "") +
        (selected ? " is-selected" : "") +
        '" data-skin="' +
        s.id +
        '"><span class="hub-skin-swatch" style="background:' +
        s.head +
        '"></span><div><div class="hub-item-title">' +
        s.name +
        (selected ? " · 使用中" : on ? "" : " · 锁定") +
        '</div><div class="hub-item-desc">' +
        (on ? "点击选用" : "解锁成就「" + need + "」后可用") +
        "</div></div></li>";
    }
    list.innerHTML = html;
  }

  function chapterCleared(id) {
    return !!(meta.chaptersCleared && meta.chaptersCleared[id]);
  }

  function chapterPlayable(c) {
    if (!c) return false;
    // First chapter always open; later chapters: clear previous OR matching achievement
    if (!c.requiresClear) return true;
    if (chapterCleared(c.requiresClear)) return true;
    if (c.unlockAch && isUnlocked(c.unlockAch)) return true;
    return false;
  }

  function getChapter(id) {
    for (var i = 0; i < STORY.length; i++) {
      if (STORY[i].id === id) return STORY[i];
    }
    return null;
  }

  function markChapterCleared(id) {
    if (!id) return;
    if (!meta.chaptersCleared) meta.chaptersCleared = {};
    if (meta.chaptersCleared[id]) {
      saveMeta();
      renderStory();
      return;
    }
    meta.chaptersCleared[id] = Date.now();
    saveMeta();
    var el = $("toast");
    if (el) {
      el.textContent = "章节通关 · " + ((getChapter(id) && getChapter(id).title) || id);
      el.className = "toast toast-ok";
      void el.offsetWidth;
      setTimeout(function () {
        el.classList.add("hidden");
      }, 1600);
    }
    renderStory();
  }

  function renderStory() {
    var list = $("hubStoryList");
    if (!list) return;
    var html = "";
    for (var i = 0; i < STORY.length; i++) {
      var c = STORY[i];
      var on = chapterPlayable(c);
      var cleared = chapterCleared(c.id);
      var status = !on ? "锁定" : cleared ? "已通关" : "可挑战";
      var desc = !on
        ? c.requiresClear
          ? "先通关上一章，或解锁对应成就"
          : "未解锁"
        : "目标：" + c.goalText + " · 点击查看 / 开打";
      html +=
        '<li class="hub-item hub-story' +
        (on ? " is-on" : "") +
        (cleared ? " is-cleared" : "") +
        '" data-story="' +
        c.id +
        '"><div><div class="hub-item-title">' +
        c.title +
        " · " +
        status +
        '</div><div class="hub-item-desc">' +
        desc +
        "</div></div></li>";
    }
    list.innerHTML = html;
    setHidden($("hubStoryReader"), true);
  }

  function readStory(id) {
    var c = getChapter(id);
    if (!c) return;
    if (!chapterPlayable(c)) return;
    meta.seenStory[c.id] = true;
    saveMeta();
    var reader = $("hubStoryReader");
    var title = $("hubStoryReaderTitle");
    var body = $("hubStoryReaderBody");
    var goalEl = $("hubStoryGoal");
    var playBtn = $("hubStoryPlay");
    if (title) title.textContent = c.title;
    if (body) body.textContent = c.body;
    if (goalEl) {
      goalEl.textContent =
        "过关目标：" +
        c.goalText +
        " · 推荐难度：" +
        ({ easy: "简单", normal: "普通", hell: "地狱" }[c.difficulty] || c.difficulty) +
        (chapterCleared(c.id) ? " · 已通关（可再打）" : "");
    }
    if (playBtn) playBtn.setAttribute("data-play-chapter", c.id);
    setHidden(reader, false);
  }

  function startChapter(id) {
    var c = getChapter(id);
    if (!c || !chapterPlayable(c)) return;
    hideHub();
    var tab = $("tabModeSingle");
    if (tab) tab.click();
    var g = window.PixelSnakeGame;
    if (g && g.startCampaign) {
      g.startCampaign({
        id: c.id,
        title: c.title,
        body: c.body,
        goal: c.goal,
        goalText: c.goalText,
        difficulty: c.difficulty,
      });
    }
  }

  function selectSkin(id) {
    var s = null;
    for (var i = 0; i < SKINS.length; i++) {
      if (SKINS[i].id === id) s = SKINS[i];
    }
    if (!s || !skinUnlocked(s)) return;
    skinId = s.id;
    try {
      localStorage.setItem(SKIN_KEY, skinId);
    } catch (e) {}
    renderSkins();
    var g = window.PixelSnakeGame;
    if (g && g.redraw) g.redraw();
  }

  function onFoodEaten(score, foodsEaten, level) {
    if (foodsEaten >= 1) unlock("first_bite");
    if (score >= 50) unlock("score_50");
    if (score >= 100) unlock("score_100");
    if (score >= 200) unlock("score_200");
    if (level >= 3) unlock("level_3");
    if (score < 0) unlock("loan_shark");
  }

  function onPower(type) {
    unlock("power_collector");
    // devil_deal unlocks only after a successful score→lives trade (game.js)
    if (type === "ghost") unlock("ghost_walk");
    if (type === "bomb") unlock("bomber");
  }

  function onLives(lives) {
    if (lives >= 2) unlock("two_lives");
  }

  function onScore(score) {
    if (score >= 50) unlock("score_50");
    if (score >= 100) unlock("score_100");
    if (score >= 200) unlock("score_200");
    if (score < 0) unlock("loan_shark");
  }

  function onGameOver(score, level) {
    onScore(score);
    if (level >= 3) unlock("level_3");
  }


  function unlockAllDev() {
    if (!isDevMode()) return false;
    var i;
    for (i = 0; i < ACHIEVEMENTS.length; i++) {
      meta.unlocked[ACHIEVEMENTS[i].id] = meta.unlocked[ACHIEVEMENTS[i].id] || Date.now();
    }
    if (!meta.chaptersCleared) meta.chaptersCleared = {};
    for (i = 0; i < STORY.length; i++) {
      meta.chaptersCleared[STORY[i].id] = meta.chaptersCleared[STORY[i].id] || Date.now();
      meta.seenStory[STORY[i].id] = true;
    }
    saveMeta();
    // unlock + select last premium skin for visibility
    try {
      localStorage.setItem(SKIN_KEY, "gold");
      skinId = "gold";
    } catch (e) {}
    renderAchievements();
    renderSkins();
    renderStory();
    var g = window.PixelSnakeGame;
    if (g && g.redraw) g.redraw();
    var el = $("toast");
    if (el) {
      el.textContent = "开发者 · 已全解锁";
      el.className = "toast toast-ok";
      void el.offsetWidth;
      setTimeout(function () {
        el.classList.add("hidden");
      }, 1400);
    }
    return true;
  }

  function resetProgressDev() {
    if (!isDevMode()) return false;
    meta.unlocked = {};
    meta.seenStory = {};
    meta.chaptersCleared = {};
    saveMeta();
    try {
      localStorage.setItem(SKIN_KEY, "cyan");
      skinId = "cyan";
    } catch (e) {}
    renderAchievements();
    renderSkins();
    renderStory();
    var g = window.PixelSnakeGame;
    if (g && g.redraw) g.redraw();
    var el = $("toast");
    if (el) {
      el.textContent = "开发者 · 进度已清空";
      el.className = "toast toast-ok";
      void el.offsetWidth;
      setTimeout(function () {
        el.classList.add("hidden");
      }, 1400);
    }
    return true;
  }

  function wire() {
    var hubPlay = $("hubPlay");
    var hubMp = $("hubMp");

    var devStrip = $("hubDevStrip");
    if (devStrip) {
      if (isDevMode()) {
        setHidden(devStrip, false);
        try {
          localStorage.setItem("pixel-snake-dev", "1");
        } catch (e) {}
      } else {
        setHidden(devStrip, true);
      }
    }
    var btnUnlock = $("hubDevUnlockAll");
    if (btnUnlock) btnUnlock.addEventListener("click", unlockAllDev);
    var btnReset = $("hubDevReset");
    if (btnReset) btnReset.addEventListener("click", resetProgressDev);

    var hubAch = $("hubOpenAchievements");
    var hubSk = $("hubOpenSkins");
    var hubSt = $("hubOpenStory");
    var hubSeason = $("hubOpenSeason");
    var backs = document.querySelectorAll("[data-hub-back]");
    var btnMenu = $("btnHubMenu");

    if (hubPlay) {
      hubPlay.addEventListener("click", function () {
        hideHub();
        var tab = $("tabModeSingle");
        if (tab) tab.click();
        var g = window.PixelSnakeGame;
        if (g && g.prepareFromHub) g.prepareFromHub();
      });
    }
    if (hubMp) {
      hubMp.addEventListener("click", function () {
        hideHub();
        var tab = $("tabModeMp");
        if (tab) tab.click();
      });
    }
    if (hubAch) hubAch.addEventListener("click", function () { openPanel("achievements"); });
    if (hubSk) hubSk.addEventListener("click", function () { openPanel("skins"); });
    if (hubSt) hubSt.addEventListener("click", function () { openPanel("story"); });
    if (hubSeason) {
      hubSeason.addEventListener("click", function () {
        hideHub();
        var fb = window.PixelSnakeFirebase;
        if (fb && fb.showSeasonBoard) fb.showSeasonBoard();
        else {
          var tab = $("tabSeason");
          if (tab) tab.click();
        }
      });
    }
    for (var i = 0; i < backs.length; i++) {
      backs[i].addEventListener("click", showHubHome);
    }
    if (btnMenu) {
      btnMenu.addEventListener("click", function () {
        showHub();
      });
    }

    var skinsList = $("hubSkinsList");
    if (skinsList) {
      skinsList.addEventListener("click", function (e) {
        var li = e.target.closest("[data-skin]");
        if (!li) return;
        selectSkin(li.getAttribute("data-skin"));
      });
    }
    var storyList = $("hubStoryList");
    if (storyList) {
      storyList.addEventListener("click", function (e) {
        var li = e.target.closest("[data-story]");
        if (!li) return;
        readStory(li.getAttribute("data-story"));
      });
    }
    var storyClose = $("hubStoryReaderClose");
    if (storyClose) {
      storyClose.addEventListener("click", function () {
        setHidden($("hubStoryReader"), true);
      });
    }
    var storyPlay = $("hubStoryPlay");
    if (storyPlay) {
      storyPlay.addEventListener("click", function () {
        var id = storyPlay.getAttribute("data-play-chapter");
        if (id) startChapter(id);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    wire();
    showHub();
    renderAchievements();
    renderSkins();
    renderStory();
  });
  // In case script loads after DOMContentLoaded
  if (document.readyState !== "loading") {
    wire();
    showHub();
    renderAchievements();
    renderSkins();
    renderStory();
  }

  window.PixelSnakeMeta = {
    unlock: unlock,
    onFoodEaten: onFoodEaten,
    onPower: onPower,
    onLives: onLives,
    onScore: onScore,
    onGameOver: onGameOver,
    getSkin: getSkin,
    showHub: showHub,
    hideHub: hideHub,
    isHubOpen: isHubOpen,
    markChapterCleared: markChapterCleared,
    getChapter: getChapter,
    isDevMode: isDevMode,
    unlockAllDev: unlockAllDev,
    resetProgressDev: resetProgressDev,
  };
})();
