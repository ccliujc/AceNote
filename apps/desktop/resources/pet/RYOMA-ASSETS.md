# 越前龙马桌宠素材与澳网蓝主题

2026-10-30：人物头身比例已按用户要求调整，当前素材和编辑提示词见 [RYOMA-PROPORTIONS.md](RYOMA-PROPORTIONS.md)。下文保留初版素材来源与提示词。

2026-10-29，按用户要求替换人物。生成方式：**内置 imagegen**；没有使用 CLI/API fallback。以[官方青学角色页](https://tenipuri.jp/character/seigaku)及其[人物图](https://tenipuri.jp/assets/img/character/img/seigaku_ryoma.gif)为身份参考，制作适合透明桌宠的 Q 版适配图。蓝色球场参考 [Australian Open：Green to blue](https://ausopen.com/history/memorable-moments/2008-green-blue)，具体色值为本项目适配。

## 应用资源

| 状态     | 项目文件                                    | 生成源文件                                      |
| -------- | ------------------------------------------- | ----------------------------------------------- |
| 持拍待机 | `apps/desktop/resources/pet/ryoma-idle.png` | `exec-0dbdf523-9913-4749-b028-57cfcc8ccc53.png` |
| 左手击球 | `apps/desktop/resources/pet/ryoma-hit.png`  | `exec-83c86d67-df1a-4ef3-9db8-c39184310212.png` |
| 举拳庆祝 | `apps/desktop/resources/pet/ryoma-ace.png`  | `exec-4caae2fa-ecf8-4c3b-a95f-d77ba740de5a.png` |

生成原图仅保留在制作时的本机输出目录；运行所需的最终 PNG 均已放在当前目录，不依赖生成工具或其他本机文件。使用系统 sips 仅规范化到 512×512 RGBA PNG，保留生成的透明 alpha。三张分别为 213649、216814、204337 字节，均存在完全透明和不透明像素。旧资源与[上一版素材记录](ASSETS.md)保留用于历史回溯，应用只引用新文件。

## 提示词归档

### idle（官方人物图作为参考）

Use case: identity-preserve. Input image 1 is the official visual identity reference for RYOMA ECHIZEN (越前リョーマ / 越前龙马) from The Prince of Tennis. Create a NEW full-body transparent desktop-pet illustration of this exact recognizable character, adapted as a polished anime chibi about 3 heads tall. Preserve his signature white baseball cap with its small red-and-navy R emblem, short spiky very dark green-black hair, sharp amber/olive catlike eyes, and cool confident small smirk. Wear the classic Seigaku tennis uniform: white polo with royal-blue shoulder/short-sleeve panels and a red accent side stripe, navy tennis shorts, white socks and white sneakers with blue/red trim. Pose: ready to play, relaxed athletic stance, tennis racket in HIS LEFT HAND (on the viewer's right in this front three-quarter view), one yellow tennis ball in his right hand. Entire cap, racket, hands and both shoes must be fully visible. Center in a square canvas with generous 12% transparent padding on all edges. Crisp clean dark-navy anime outlines, tasteful cel shading, readable at 180px high, character art rather than a generic tennis boy. Actual transparent alpha background; no court, background, floor, ground shadow, scenery, text captions, speech balloons, watermark or border. This is the IDLE / ready state of a 3-pose consistent sprite set for a blue tennis app.

### hit（idle 源图作为身份参考）

Use case: identity-preserve. Input image is the edit target and identity reference: the established chibi RYOMA ECHIZEN (越前龙马) desktop-pet sprite. Create his HIT pose, preserving exactly the same white cap with small red/navy R emblem, dark green-black spiky hair, sharp amber/olive eyes, cool expression, chibi proportions, white/royal-blue/red Seigaku polo, navy shorts, socks and white sneakers with blue/red trim, crisp dark-navy outlines and cel shading. Change only his pose: a dynamic LEFT-HANDED forehand, racket held in HIS LEFT HAND, body turning into a shot, one yellow tennis ball near the racket. Keep both hands, entire cap, racket and both shoes fully inside a square canvas with 10–12% transparent padding. Full body. One character only, readable at 180px tall. Actual transparent alpha background, no court, ground, shadow, scenery, text captions, speech balloons, watermark or border.

### hit 左手校正（上一张击球图作为编辑目标）

Use case: precise-object-edit. Correct only the handedness of this Ryoma Echizen hit sprite. The current racket is in his right hand; Ryoma must play LEFT-HANDED. Mirror the body pose so the racket and yellow ball are on the VIEWER'S RIGHT, with racket gripped in HIS LEFT HAND, and his empty right arm extends toward the VIEWER'S LEFT. Preserve his exact face, white cap, leg stance, Seigaku blue/white/red uniform, sneakers, proportions, crisp anime rendering and full-body framing. Keep the red R cap emblem readable and not backwards. Transparent alpha background, no floor or shadows, no added text or objects, keep entire racket and both shoes in frame.

初次 hit 图 `exec-a0db88f4-a0f2-4246-b3f9-5c7cd8bcf806.png` 未采用，因为持拍手需要校正。最终源图已目视核对左手持拍。

### ace（idle 源图作为身份参考，规范化归档的设计提示）

Use case: identity-preserve. Edit target: the generated Ryoma Echizen idle sprite. Preserve the same white R cap, dark green-black hair, amber/olive eyes, cool confident expression, white/royal-blue/red Seigaku polo, navy shorts, socks, blue/red/white sneakers, chibi proportions, crisp outlines and cel shading. Change pose to an ACE celebration: racket held in HIS LEFT HAND, right fist raised, one knee lifted, a restrained cool smirk. Full body, entire cap, racket, fist and both shoes visible, centered in a square canvas with transparent safety margin. Actual transparent alpha background. No court, ground shadow, scenery, text captions, watermark, border, confetti or extra characters.

## 主题

品牌蓝 `#006cc7`、深蓝 `#075a9f`、冰蓝底 `#edf5fd`、球场蓝 `#1674b0`、白色场线 `#f1faff`。小面积网球黄 `#e1f262` 用于网球和球场选中指示；错误与警告继续使用可辨认的语义色。

实现规范见 [SPEC-ao-blue-ryoma.md](../../../../spec/SPEC-ao-blue-ryoma.md)，验证记录见 [todo-ao-blue-ryoma.md](../../../../tasks/todo-ao-blue-ryoma.md)。
