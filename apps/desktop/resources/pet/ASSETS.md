# 网球人物桌宠素材（历史版本）

当前应用已改用越前龙马素材，见 [RYOMA-ASSETS.md](RYOMA-ASSETS.md)。

2026-10-29，按用户“卡通人物打网球”要求使用内置 imagegen 生成，同一角色的持拍、击球和庆祝姿态。

本版资源：

- `tennis-player-idle.png`：持拍准备。
- `tennis-player-hit.png`：正手击球。
- `tennis-player-ace.png`：举拳庆祝。

三张均以透明 alpha 导出，再用系统 sips 规范化为 512×512 PNG；没有重新绘制、移除背景或改动人物内容。旧 `pet-*.png` 占位资源保留供历史回溯，当前应用不再引用。

生成原图仅保留在制作时的本机输出目录，以下文件名用于来源追溯；运行所需的最终 PNG 均已放在当前目录，不依赖该输出目录：

- idle：`exec-9c455f37-97fe-41af-aa65-296e5a10e09e.png`
- hit：`exec-b6dd530a-65c5-4912-b503-d8499615eed1.png`
- ace：`exec-58bc8eeb-662f-49cf-b895-7c55f73b5672.png`

生成提示词如下；hit 与 ace 以 idle 源图为身份与风格参考。

## idle

Use case: illustration-story. Asset type: transparent PNG desktop companion for the AceNote tennis productivity app. Create ONE original cute cartoon HUMAN tennis player, full body, alone, in a relaxed ready-to-play pose holding a tennis racket, one lime tennis ball near the free hand. This is a friendly androgynous young adult human with short dark hair under a cream tennis visor, expressive dark eyes and a cheerful small smile, wearing a forest-green short-sleeve tennis shirt, cream shorts, white socks and green-and-cream court shoes. Chibi 2.8-heads-tall proportions, tasteful modern 2D character illustration, clean confident dark-green outlines, subtle soft cel shading, restrained warm cream / forest green / tennis-lime palette matching the app. Readable and appealing as a small 180px desktop pet. Front three-quarter view, whole racket and both shoes fully visible, centered in a square canvas with at least 10% clear safety margin on every side. Actual transparent alpha background, isolated cutout, NO ground plane, NO background, NO scenery, NO text, NO logo, NO watermark, NO panel, NO border, NO additional characters. This is a human playing tennis, not an anthropomorphic tennis ball. Target export square 512 by 512 pixels.

## hit

Use case: identity-preserve. Edit target: the attached transparent desktop companion illustration. Keep this EXACT same original human tennis character identity, short dark hair, cream visor, green polo with cream trim, cream shorts, socks, green-and-cream shoes, face, proportions, clean outline and cel-shaded art style. Change ONLY the pose into an energetic tennis FOREHAND STRIKE: full body in a clear balanced athletic stance, knees bent, racket swinging across the body making contact with ONE lime tennis ball, expressive focused cheerful face. Both hands and both shoes anatomically clear, normal limbs, entire racket visible. Maintain similar subject scale to the source image and center within a SQUARE canvas, at least 8% safe transparent margin all around. This is the HIT animation state of the same small desktop pet. Actual transparent alpha background, no court, ground plane, scenery, labels, text, watermark, decorative frame or extra characters. Do not change clothing or character identity.

## ace

Use case: identity-preserve. Edit target: the reference transparent tennis player illustration. Keep the EXACT SAME human character identity, face, short dark hair, cream tennis visor, forest-green polo with cream trim, cream shorts, socks, green-and-cream sneakers, proportions and 2D clean outlined cel-shaded illustration style. Change ONLY pose/expression: a joyful ACE victory celebration, small athletic hop with one fist raised and racket held upright in the other hand, full body visible, warm confident smile, one knee slightly lifted. No extra arms or hands. Keep subject centered in a SQUARE canvas, whole racket, fist, visor and both shoes entirely inside, at least 10% transparent safety margin on every edge; scale the person to similar height as the source. Real transparent alpha background, isolated cutout. No ground, scenery, text, letters, logos, watermark, panels, confetti or other characters. This is the celebration animation state for the same desktop pet.
