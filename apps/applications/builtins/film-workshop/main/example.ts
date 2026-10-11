import {
  blankAsset,
  blankShot,
  createProject,
  type FilmProject,
} from "./model";

/** Explicitly loaded example; no generated media or completed tasks are simulated. */
export function exampleProject(): FilmProject {
  const project = createProject("雨夜电台", "comicDrama");
  const character = {
    ...blankAsset("character"),
    name: "林夏",
    description:
      "24 岁，深夜电台的实习主持人。短发、深蓝雨衣，随身带着旧录音机。",
    prompt: "短发年轻女性，深蓝雨衣，旧录音机，手绘电影质感，柔和轮廓光",
  };
  const scene = {
    ...blankAsset("scene"),
    name: "旧电台",
    description: "城市边缘的老电台，窗外下着雨。木桌、暖色台灯与磁带机。",
    prompt: "雨夜旧电台室内，木桌，暖色台灯，磁带机，窗上雨水，冷暖对比",
  };
  project.style = "手绘电影质感，雨夜蓝色与台灯暖色对比";
  project.synopsis =
    "即将关闭的电台里，林夏收到一盘没有署名的磁带。熟悉的声音让她决定再播出最后一次节目。";
  project.assets = [character, scene];
  project.episodes[0].title = "最后一次播音";
  project.episodes[0].script =
    "内景 · 旧电台 · 雨夜\n\n雨点敲打玻璃。林夏推开电台的门，把一盘旧磁带放在木桌上。\n\n她按下播放键。磁带转动，传来一个熟悉的声音。\n\n林夏（轻声）：如果你还在听，今晚的节目，送给你。\n\n她抬起头，打开红色的播音指示灯。";
  project.episodes[0].shots = [
    {
      ...blankShot(1),
      title: "雨中的窗",
      description: "雨水沿玻璃滑落，窗内的台灯亮着。",
      framing: "远景",
      camera: "缓慢推进",
      duration: 4,
      sceneId: scene.id,
      imagePrompt: "雨夜旧电台窗户，玻璃雨水，室内暖光，电影远景，16:9",
      videoPrompt: "镜头缓慢靠近窗户，雨水持续滑落，暖光稳定",
      sound: "窗外雨声，远处低沉的城市底噪",
    },
    {
      ...blankShot(2),
      title: "磁带开始转动",
      description: "林夏将旧磁带放入磁带机，手指按下播放键。",
      framing: "特写",
      duration: 3,
      sceneId: scene.id,
      characterIds: [character.id],
      imagePrompt: "旧磁带机和按下播放键的手指，暖色台灯，细腻手绘特写",
      videoPrompt: "手指按下按钮，磁带开始转动，固定特写",
      sound: "机械按钮声，轻微磁带底噪",
    },
    {
      ...blankShot(3),
      title: "最后一次播音",
      description: "林夏戴上耳机，望向话筒，播音指示灯亮起。",
      duration: 6,
      sceneId: scene.id,
      characterIds: [character.id],
      speakerId: character.id,
      dialogue: "如果你还在听，今晚的节目，送给你。",
      voice: "年轻女声，轻柔克制，语速稍慢",
      imagePrompt:
        "短发女性电台主持人，深蓝雨衣，耳机，话筒，红色指示灯，手绘电影中景",
      videoPrompt: "人物轻轻抬头并说话，红色指示灯亮起，固定中景",
      sound: "雨声渐弱，舒缓钢琴进入",
    },
  ];
  return project;
}
