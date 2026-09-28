import type { ReactNode } from "react";
import type { Activity } from "./office-model";

type ArtActivity = Extract<Activity, "cartoon" | "movie" | "web" | "game" | "nap" | "coffee" | "stretch" | "standby">;
type SketchActivity = Exclude<Activity, ArtActivity>;
const ART_TILES: Record<ArtActivity, number> = {
  cartoon: 0,
  movie: 1,
  web: 2,
  game: 3,
  nap: 5,
  coffee: 5,
  stretch: 5,
  standby: 5,
};
const isArtActivity = (activity: Activity): activity is ArtActivity =>
  Object.prototype.hasOwnProperty.call(ART_TILES, activity);
const LABELS: Record<SketchActivity, string> = {
  plan: "TODAY'S PLAN",
  code: "CODE EDITOR",
  research: "RESEARCH",
  write: "DRAFT",
  archive: "FILES",
  review: "REVIEW",
  email: "INBOX",
  meeting: "MEETING NOTES",
  learn: "LEARNING",
  design: "DESIGN STUDIO",
  calendar: "CALENDAR",
  data: "DATA INSIGHTS",
  thinking: "IDEA BOARD",
  music: "NOW PLAYING",
  reading: "LIBRARY",
  puzzle: "PUZZLE",
};

function lines(widths: number[], x: number, y: number, color: string, step = 13): ReactNode {
  return widths.map((width, index) => (
    <rect key={index} x={x} y={y + index * step} width={width} height="5" rx="2.5" fill={color} />
  ));
}

function ScreenSketch({ activity }: { activity: SketchActivity }) {
  const dark = activity === "code" || activity === "music";
  const background = dark ? "#172844" : "#f4f3fa";
  const header = dark ? "#263859" : "#e4e2f3";
  const ink = dark ? "#edf0ff" : "#34415f";
  let picture: ReactNode;

  switch (activity) {
    case "plan":
      picture = (
        <>
          {[18, 117, 216].map((x, column) => (
            <g key={x}>
              <rect x={x} y="38" width="87" height="126" rx="8" fill={["#e8e1f9", "#e0edf8", "#e7f2df"][column]} />
              <rect x={x + 10} y="49" width="53" height="7" rx="3" fill={["#8970c9", "#619ac8", "#80a56d"][column]} />
              {[67, 97, 127].map((y) => (
                <g key={y}>
                  <rect x={x + 8} y={y} width="71" height="23" rx="5" fill="white" />
                  <rect x={x + 15} y={y + 8} width={43 + (column % 2) * 8} height="5" rx="2" fill="#b0aaca" />
                </g>
              ))}
            </g>
          ))}
        </>
      );
      break;
    case "code":
      picture = (
        <>
          <rect x="0" y="24" width="52" height="156" fill="#1e3150" />
          {[43, 67, 91, 115].map((y, index) => (
            <rect key={y} x="13" y={y} width={index === 1 ? 32 : 21} height="5" rx="2" fill="#7791b2" />
          ))}
          {[43, 60, 77, 94, 111, 128, 145].map((y, index) => (
            <g key={y}>
              <rect x="70" y={y} width="14" height="5" rx="2" fill="#637998" />
              <rect
                x="97"
                y={y}
                width={[47, 83, 35, 98, 71, 56, 89][index]}
                height="6"
                rx="2"
                fill={index % 3 === 0 ? "#e8a6b9" : index % 3 === 1 ? "#a4d6cd" : "#c7b7f4"}
              />
              {index < 5 && <rect x="201" y={y} width={index % 2 ? 30 : 53} height="6" rx="2" fill="#e9c989" />}
            </g>
          ))}
        </>
      );
      break;
    case "research":
      picture = (
        <>
          <rect x="19" y="39" width="282" height="30" rx="15" fill="white" stroke="#b8d5da" />
          <circle cx="37" cy="54" r="7" fill="none" stroke="#6da4af" strokeWidth="3" />
          <path d="m42 59 7 7" stroke="#6da4af" strokeWidth="3" />
          {lines([107], 62, 52, "#95afc0")}
          {[82, 111, 140].map((y, index) => (
            <g key={y}>
              <rect x="19" y={y} width="282" height="23" rx="5" fill="white" />
              <rect x="29" y={y + 7} width="14" height="9" rx="2" fill={["#77aaca", "#bba6d8", "#8dbea2"][index]} />
              <rect x="54" y={y + 6} width={80 + index * 24} height="5" rx="2" fill="#6d85a8" />
              <rect x="54" y={y + 14} width="176" height="4" rx="2" fill="#c1ccdc" />
            </g>
          ))}
        </>
      );
      break;
    case "write":
      picture = (
        <>
          <rect x="13" y="38" width="57" height="126" rx="5" fill="#e8e3f4" />
          {lines([35, 28, 39, 31], 23, 52, "#9d94bf", 24)}
          <rect x="83" y="34" width="224" height="135" rx="5" fill="white" />
          <rect x="105" y="52" width="122" height="9" rx="3" fill="#756b9c" />
          {lines([175, 161, 180, 143, 171, 123, 163], 105, 75, "#c5bfd4", 12)}
          <rect x="189" y="147" width="2" height="12" fill="#8f7cc7" />
        </>
      );
      break;
    case "archive":
      picture = (
        <>
          <rect x="13" y="37" width="72" height="129" rx="6" fill="#e4e7f3" />
          {lines([37, 45, 31, 42], 26, 54, "#8999bb", 25)}
          {[113, 178, 243].flatMap((x) =>
            [47, 103].map((y) => (
              <g key={`${x}-${y}`}>
                <rect x={x} y={y + 5} width="44" height="35" rx="4" fill="#e6b66b" />
                <rect x={x} y={y} width="21" height="11" rx="3" fill="#f1cc87" />
                <rect x={x + 5} y={y + 17} width="31" height="5" rx="2" fill="#f8dfb1" />
              </g>
            )),
          )}
        </>
      );
      break;
    case "review":
      picture = (
        <>
          <rect x="16" y="39" width="181" height="126" rx="8" fill="white" />
          {[53, 79, 105, 131].map((y, index) => (
            <g key={y}>
              <rect x="28" y={y} width="15" height="15" rx="3" fill={index === 3 ? "#ece6ed" : "#8dc9a2"} />
              {index !== 3 && <path d={`m31 ${y + 7} 3 3 6-7`} fill="none" stroke="white" strokeWidth="2" />}
              <rect x="53" y={y + 4} width={90 + index * 10} height="6" rx="3" fill="#aeb7d1" />
            </g>
          ))}
          <rect x="210" y="39" width="94" height="126" rx="8" fill="#e6e0f5" />
          <circle cx="257" cy="94" r="30" fill="none" stroke="#b6a5dd" strokeWidth="10" />
          <path d="M257 64a30 30 0 0 1 27 43" fill="none" stroke="#806ab9" strokeWidth="10" />
          <rect x="227" y="137" width="60" height="6" rx="3" fill="#b6a5dd" />
        </>
      );
      break;
    case "email":
      picture = (
        <>
          <rect x="16" y="38" width="53" height="128" rx="6" fill="#e5e7f6" />
          {lines([28, 35, 25, 31], 26, 55, "#8e9bc8", 25)}
          {[40, 71, 102, 133].map((y, index) => (
            <g key={y}>
              <rect x="79" y={y} width="226" height="27" rx="5" fill={index === 0 ? "#dce7ff" : "white"} />
              <circle cx="94" cy={y + 13} r="8" fill={["#9b91d3", "#7cbba8", "#e7ad8a", "#93afcf"][index]} />
              <rect x="110" y={y + 7} width="73" height="5" rx="2" fill="#7d8bb6" />
              <rect x="110" y={y + 16} width="158" height="4" rx="2" fill="#bec6d9" />
            </g>
          ))}
        </>
      );
      break;
    case "meeting":
      picture = (
        <>
          <rect x="15" y="40" width="190" height="126" rx="8" fill="white" />
          <path d="M42 56v90" stroke="#c2bad9" strokeWidth="3" />
          {[59, 95, 131].map((y, index) => (
            <g key={y}>
              <circle cx="42" cy={y} r="8" fill={["#8e86cf", "#93b7cf", "#c3a0c5"][index]} />
              <rect x="60" y={y - 5} width="104" height="6" rx="3" fill="#8f94b7" />
              <rect x="60" y={y + 7} width="68" height="4" rx="2" fill="#c0c4d7" />
            </g>
          ))}
          <rect x="217" y="40" width="88" height="126" rx="8" fill="#eae5f7" />
          {[242, 262, 282].map((x, index) => (
            <circle key={x} cx={x} cy={80 + (index % 2) * 18} r="13" fill={["#b7a5dc", "#90bdd0", "#e5b9a1"][index]} />
          ))}
          {lines([53, 62], 230, 126, "#b3a5d4", 13)}
        </>
      );
      break;
    case "learn":
      picture = (
        <>
          <rect x="17" y="38" width="190" height="115" rx="7" fill="#516c9e" />
          <circle cx="112" cy="94" r="25" fill="#ffffffd9" />
          <path d="m105 80 0 28 22-14Z" fill="#6d77be" />
          <rect x="17" y="159" width="190" height="5" rx="2" fill="#b3bbd1" />
          <rect x="17" y="159" width="73" height="5" rx="2" fill="#8778c9" />
          {[45, 81, 117].map((y, index) => (
            <g key={y}>
              <rect x="220" y={y} width="83" height="28" rx="5" fill={["#dedaf2", "#e2eaf4", "#e7e2f3"][index]} />
              <rect x="229" y={y + 9} width="49" height="6" rx="2" fill="#a5a1c4" />
            </g>
          ))}
        </>
      );
      break;
    case "design":
      picture = (
        <>
          <rect x="0" y="24" width="48" height="156" fill="#dedbea" />
          {[46, 71, 96, 121].map((y, index) => (
            <rect
              key={y}
              x="16"
              y={y}
              width="16"
              height="16"
              rx={index % 2 ? 8 : 3}
              fill={["#8e78c5", "#7eb8c7", "#e5aa9e", "#9cbf9d"][index]}
            />
          ))}
          <rect x="63" y="36" width="197" height="132" rx="6" fill="white" />
          <rect x="77" y="49" width="169" height="47" rx="6" fill="#d8d1ee" />
          <circle cx="114" cy="72" r="16" fill="#f1c1aa" />
          <rect x="139" y="59" width="81" height="8" rx="3" fill="#8575bd" />
          <rect x="139" y="74" width="61" height="6" rx="3" fill="#a6a0c3" />
          {[79, 134, 189].map((x, index) => (
            <rect key={x} x={x} y="109" width="46" height="43" rx="5" fill={["#e9bdd4", "#b8d9d3", "#f2d6a8"][index]} />
          ))}
          <rect x="271" y="36" width="37" height="132" rx="5" fill="#e9e6f2" />
          {[49, 77, 105, 133].map((y, index) => (
            <circle key={y} cx="289" cy={y} r="9" fill={["#a68acb", "#e3a3ab", "#8fb5cc", "#efc58b"][index]} />
          ))}
        </>
      );
      break;
    case "calendar":
      picture = (
        <>
          <rect x="16" y="37" width="198" height="131" rx="8" fill="white" />
          {Array.from({ length: 35 }, (_, index) => {
            const x = 27 + (index % 7) * 26,
              y = 53 + Math.floor(index / 7) * 21;
            return (
              <rect
                key={index}
                x={x}
                y={y}
                width="20"
                height="15"
                rx="3"
                fill={index === 10 || index === 18 ? "#a493d4" : index === 4 || index === 24 ? "#e8baa4" : "#edf0f7"}
              />
            );
          })}
          <rect x="227" y="37" width="77" height="131" rx="8" fill="#e2e9f8" />
          {[51, 88, 125].map((y, index) => (
            <g key={y}>
              <rect x="238" y={y} width="8" height="22" rx="4" fill={["#8f81c8", "#8db6c9", "#e4b29e"][index]} />
              <rect x="253" y={y + 3} width="39" height="5" rx="2" fill="#8995b9" />
              <rect x="253" y={y + 13} width="29" height="4" rx="2" fill="#b9c2d8" />
            </g>
          ))}
        </>
      );
      break;
    case "data":
      picture = (
        <>
          <rect x="16" y="39" width="91" height="49" rx="7" fill="#e2e2f4" />
          <rect x="117" y="39" width="91" height="49" rx="7" fill="#e2eef0" />
          <rect x="218" y="39" width="86" height="49" rx="7" fill="#f5e9e0" />
          {[32, 133, 234].map((x, index) => (
            <g key={x}>
              <rect x={x} y="52" width="37" height="7" rx="3" fill={["#8c7dc6", "#74aeba", "#d4a081"][index]} />
              <rect x={x} y="66" width="58" height="6" rx="3" fill="#b2b4cf" />
            </g>
          ))}
          <rect x="16" y="100" width="188" height="66" rx="7" fill="white" />
          <path
            d="M28 149 57 135 83 141 111 119 138 127 166 112 192 118"
            fill="none"
            stroke="#8173c6"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M28 155h164" stroke="#d4d9e8" strokeWidth="2" />
          <rect x="216" y="100" width="88" height="66" rx="7" fill="white" />
          {[22, 39, 29, 48].map((height, index) => (
            <rect
              key={index}
              x={229 + index * 18}
              y={154 - height}
              width="11"
              height={height}
              rx="3"
              fill={["#a69adc", "#91bfd0", "#e0b1a1", "#9ebea4"][index]}
            />
          ))}
        </>
      );
      break;
    case "thinking":
      picture = (
        <>
          <path d="M157 99 76 58M157 99 65 141M157 99 254 54M157 99 251 140" stroke="#b7addb" strokeWidth="4" />
          {[
            [157, 99, 31, "#8c77cc"],
            [76, 58, 20, "#f0ba88"],
            [65, 141, 18, "#99c3ac"],
            [254, 54, 22, "#90afd6"],
            [251, 140, 20, "#d6a7c3"],
          ].map(([x, y, radius, fill]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={radius} fill={fill as string} />
          ))}
          <path d="M147 99h21M157 89v20" stroke="white" strokeWidth="5" strokeLinecap="round" />
        </>
      );
      break;
    case "music":
      picture = (
        <>
          <circle cx="91" cy="98" r="55" fill="#947bc2" />
          <circle cx="91" cy="98" r="34" fill="#b8a2d5" />
          <circle cx="91" cy="98" r="10" fill="#263859" />
          <rect x="171" y="51" width="116" height="9" rx="4" fill="#e8d6ef" />
          {lines([90, 63], 171, 71, "#a8b4d5", 16)}
          {[16, 30, 42, 27, 51, 34, 21].map((height, index) => (
            <rect
              key={index}
              x={174 + index * 17}
              y={151 - height}
              width="9"
              height={height}
              rx="4"
              fill={index % 2 ? "#e6acbe" : "#a49de0"}
            />
          ))}
        </>
      );
      break;
    case "reading":
      picture = (
        <>
          <rect x="0" y="24" width="320" height="156" fill="#e9decc" />
          <path
            d="M30 47q63-22 128 0v116q-67-21-128 0ZM162 47q64-22 128 0v116q-67-21-128 0Z"
            fill="#fffaf0"
            stroke="#b49b7f"
            strokeWidth="3"
          />
          <path d="M160 47v116" stroke="#c8ac88" strokeWidth="3" />
          {lines([72, 91, 82, 93, 67, 85], 46, 66, "#c4b6a5", 15)}
          {lines([91, 75, 88, 67, 94, 78], 178, 66, "#c4b6a5", 15)}
          <rect x="192" y="41" width="10" height="33" fill="#be8d8c" />
        </>
      );
      break;
    case "puzzle":
      picture = (
        <>
          <rect x="68" y="33" width="184" height="137" rx="9" fill="#d9dcf2" />
          {Array.from({ length: 16 }, (_, index) => {
            const column = index % 4,
              row = Math.floor(index / 4);
            return (
              <rect
                key={index}
                x={78 + column * 42}
                y={42 + row * 31}
                width="36"
                height="25"
                rx="5"
                fill={index === 11 ? "#f7f6fb" : ["#aa9ad8", "#a9cbd7", "#f2c89b", "#a9d1b2"][index % 4]}
              />
            );
          })}
          <circle cx="275" cy="70" r="16" fill="#f2c89b" />
          <path d="m269 70 4 4 8-9" fill="none" stroke="white" strokeWidth="3" />
        </>
      );
      break;
    default: {
      const unreachable: never = activity;
      return unreachable;
    }
  }

  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width="320" height="180" fill={background} />
      <rect width="320" height="24" fill={header} />
      <circle cx="11" cy="12" r="3" fill={dark ? "#e9b3ba" : "#d6939e"} />
      <circle cx="22" cy="12" r="3" fill={dark ? "#e9d29e" : "#d9ba88"} />
      <circle cx="33" cy="12" r="3" fill={dark ? "#afd3c1" : "#94bfa9"} />
      <text
        x="48"
        y="16"
        fill={ink}
        fontSize="11"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        letterSpacing="1"
      >
        {LABELS[activity]}
      </text>
      {picture}
    </svg>
  );
}

export function ScreenArt({ activity }: { activity: Activity }) {
  if (isArtActivity(activity)) {
    const tile = ART_TILES[activity];
    return (
      <span className={`screen-art screen-${activity}`} aria-hidden="true">
        <span
          className="screen-texture"
          style={{ backgroundPosition: `${(tile % 2) * 100}% ${Math.floor(tile / 2) * 50}%` }}
        />
      </span>
    );
  }
  return (
    <span className={`screen-art screen-${activity}`} aria-hidden="true">
      <ScreenSketch activity={activity} />
    </span>
  );
}
