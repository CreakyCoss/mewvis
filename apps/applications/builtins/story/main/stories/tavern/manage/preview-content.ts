import type {
  TavernPresentationProfileId,
  TavernRoomStyleId,
  TavernSystemNarrativeStyleId,
} from "./model";

type PreviewReply = {
  dialogue: string;
  indirect: string;
};
type PreviewScene = {
  narrator: string;
  action: string;
  pressure: string;
  replies: Record<TavernSystemNarrativeStyleId, PreviewReply>;
};

// Use the same rainy-night encounter so preset changes are easy to compare.
// These authored examples illustrate presets, rather than predict model output.
const previewScenes = {
  "silent-law": {
    narrator: "窗外雨声不断，门边留着一串水迹。",
    action: "沈砚把旧信推到桌沿，手指随即松开。",
    pressure: "门外有人停步，信上的名字仍露在灯下。",
    replies: {
      balanced: {
        dialogue: "先坐。信在这里，想看再打开。",
        indirect: "他示意来人坐下，把是否拆信的决定留给对方。",
      },
      restrained: {
        dialogue: "信在这里。",
        indirect: "他只提醒来人，信就在桌上。",
      },
      dramatic: {
        dialogue: "门外的人也在找这封信。你认得上面的名字？",
        indirect: "他指出门外的人也在找信，问来人是否认得信上的名字。",
      },
    },
  },
  novel: {
    narrator: "雨声落在窗沿，炉火映亮了桌边的旧信。",
    action: "沈砚放下书，把靠近炉火的位置留了出来。",
    pressure: "门外的脚步声忽然停住，旧信仍压在他指下。",
    replies: {
      balanced: {
        dialogue: "进来吧，外面雨大。这封信是留给你的。",
        indirect: "他邀来人进屋避雨，又指了指那封留给对方的信。",
      },
      restrained: {
        dialogue: "进来吧。信还在。",
        indirect: "他让来人进屋，只提了一句信还在。",
      },
      dramatic: {
        dialogue: "先别开门。送信的人刚走，外面又有人来了。",
        indirect: "他拦住来人开门的动作，提醒对方送信的人刚走，门外又来了人。",
      },
    },
  },
  wuxia: {
    narrator: "檐雨如丝，炉火映着桌边的剑鞘。",
    action: "沈砚收起书卷，将旧信推过半张木桌。",
    pressure: "廊下靴声骤停，他按住剑鞘，没有替来人拆信。",
    replies: {
      balanced: {
        dialogue: "少侠，先避避雨。这封旧信，你可认得？",
        indirect: "他请来人入内避雨，问对方是否认得这封旧信。",
      },
      restrained: {
        dialogue: "少侠，信在此。",
        indirect: "他拱手示意，只说旧信在此。",
      },
      dramatic: {
        dialogue: "少侠，廊下那人一路追着此信而来。你与他可有旧怨？",
        indirect: "他提醒来人，廊下那人追信而至，问双方是否有过节。",
      },
    },
  },
  "light-novel": {
    narrator: "雨点敲得窗沿噼啪响，炉边恰好空着一把椅子。",
    action: "沈砚把书倒扣，举起那封已经受潮的信。",
    pressure: "门外响起急促的敲门声，他举着信的手停在半空。",
    replies: {
      balanced: {
        dialogue: "先坐！这封信可比外面的雨更让人头大。",
        indirect: "他招呼来人坐下，半是抱怨地提起这封让人头大的信。",
      },
      restrained: {
        dialogue: "喏，你的信。还没湿透。",
        indirect: "他递来信，顺口庆幸纸还没湿透。",
      },
      dramatic: {
        dialogue: "等等，门外那家伙也说信是他的！你认识他吗？",
        indirect: "他突然叫住来人，门外的人也在索信，他追问两人是否相识。",
      },
    },
  },
  dramatic: {
    narrator: "风推开门缝，旧信的一角压在烛台下。",
    action: "沈砚按住旧信，目光停在来人手上。",
    pressure: "敲门声再次响起，他把信推近，却仍挡着门。",
    replies: {
      balanced: {
        dialogue: "你总算来了。信里的事，我想听你亲口说。",
        indirect: "他要来人坐下，表明自己想听对方亲口解释信里的事。",
      },
      restrained: {
        dialogue: "这封信，你看过了？",
        indirect: "他没有寒暄，只问来人是否看过这封信。",
      },
      dramatic: {
        dialogue: "门外的人要拿走它。你先告诉我，信里哪一句是真的？",
        indirect: "他指出门外的人要拿走信，追问信中的说法哪一句属实。",
      },
    },
  },
  grounded: {
    narrator: "窗台积了水，桌上的茶还温着。",
    action: "沈砚放下书，搬出一把椅子，把信放到桌上。",
    pressure: "有人在门外问起收信人的名字，他转头看了看门。",
    replies: {
      balanced: {
        dialogue: "坐吧，先擦擦雨水。信是今天送来的。",
        indirect: "他让来人坐下擦干雨水，说明信是今天送来的。",
      },
      restrained: {
        dialogue: "坐。信今天到的。",
        indirect: "他让来人坐下，简短交代了信的来处。",
      },
      dramatic: {
        dialogue: "外面有人问你的名字，说要把信拿回去。你认识他吗？",
        indirect: "他把门外的人问名、索信的事说清楚，问来人是否认识对方。",
      },
    },
  },
} satisfies Record<TavernRoomStyleId, PreviewScene>;

export const getTavernPreviewContent = ({
  roomStyleId,
  narrativeStyleId,
  presentationProfileId,
}: {
  roomStyleId: TavernRoomStyleId;
  narrativeStyleId: TavernSystemNarrativeStyleId;
  presentationProfileId: TavernPresentationProfileId;
}) => {
  const scene = previewScenes[roomStyleId];
  const reply = scene.replies[narrativeStyleId];
  const response =
    presentationProfileId === "third-person-prose"
      ? reply.indirect
      : `“${reply.dialogue}”`;
  const paragraphs =
    narrativeStyleId === "restrained"
      ? [scene.action + response]
      : [scene.narrator + scene.action, response];
  if (narrativeStyleId === "dramatic") paragraphs.push(scene.pressure);

  return {
    narrator: narrativeStyleId === "dramatic" ? scene.pressure : scene.narrator,
    action: scene.action,
    dialogue: reply.dialogue,
    paragraphs,
  };
};
