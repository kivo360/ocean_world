import sharp, { type OverlayOptions } from 'sharp';

// Standard LPC sheet (832x1344) row layout, 64px frames:
//   rows 0-3:   spellcast (N, W, S, E)
//   rows 4-7:   thrust    (N, W, S, E)
//   rows 8-11:  walk      (N, W, S, E) — frame 0 is rest pose, frames 1-8 are step
//   rows 12-15: slash     (N, W, S, E)
//   rows 16-19: shoot     (N, W, S, E)
//   row  20:    hurt      (S only)
const LPC_WALK = {
  walkN: 8,
  walkW: 9,
  walkS: 10,
  walkE: 11,
} as const;

// Output layout: 5 rows x 4 frames at outputFrameSize each
//   row 0: idle      (south rest pose, drawn as 4 identical frames; manifest uses 2)
//   row 1: walk-east  (frames 1..4 of LPC walk-east)
//   row 2: walk-south (frames 1..4 of LPC walk-south)
//   row 3: walk-west  (frames 1..4 of LPC walk-west)
//   row 4: walk-north (frames 1..4 of LPC walk-north)
const FRAMES_PER_ROW = 4;
const STEP_START_FRAME = 1; // frame 0 of an LPC walk row is the idle pose
const TOTAL_OUTPUT_ROWS = 5;

export interface CropOptions {
  srcFrameSize: number; // default 64
  outputFrameSize: number; // default 32
}

export async function cropWalkCycle(
  fullSheet: Buffer,
  options: CropOptions = { srcFrameSize: 64, outputFrameSize: 32 },
): Promise<Buffer> {
  const { srcFrameSize, outputFrameSize } = options;

  const meta = await sharp(fullSheet).metadata();
  const requiredHeight = (LPC_WALK.walkE + 1) * srcFrameSize;
  const requiredWidth = (STEP_START_FRAME + FRAMES_PER_ROW) * srcFrameSize;
  if (!meta.width || !meta.height) {
    throw new Error('cropWalkCycle: could not read sheet dimensions');
  }
  if (meta.width < requiredWidth || meta.height < requiredHeight) {
    throw new Error(
      `cropWalkCycle: sheet ${meta.width}x${meta.height} smaller than required ${requiredWidth}x${requiredHeight} for srcFrameSize=${srcFrameSize}`,
    );
  }

  const idleFrame = await sharp(fullSheet)
    .extract({
      left: 0,
      top: LPC_WALK.walkS * srcFrameSize,
      width: srcFrameSize,
      height: srcFrameSize,
    })
    .resize(outputFrameSize, outputFrameSize, { kernel: 'nearest' })
    .toBuffer();

  const walkRows: number[] = [LPC_WALK.walkE, LPC_WALK.walkS, LPC_WALK.walkW, LPC_WALK.walkN];
  const walkStrips: Buffer[] = [];
  for (const srcRow of walkRows) {
    const strip = await sharp(fullSheet)
      .extract({
        left: STEP_START_FRAME * srcFrameSize,
        top: srcRow * srcFrameSize,
        width: FRAMES_PER_ROW * srcFrameSize,
        height: srcFrameSize,
      })
      .resize(FRAMES_PER_ROW * outputFrameSize, outputFrameSize, { kernel: 'nearest' })
      .toBuffer();
    walkStrips.push(strip);
  }

  const overlays: OverlayOptions[] = [];

  for (let i = 0; i < FRAMES_PER_ROW; i++) {
    overlays.push({ input: idleFrame, top: 0, left: i * outputFrameSize });
  }

  for (let i = 0; i < walkStrips.length; i++) {
    overlays.push({
      input: walkStrips[i],
      top: (1 + i) * outputFrameSize,
      left: 0,
    });
  }

  return sharp({
    create: {
      width: FRAMES_PER_ROW * outputFrameSize,
      height: TOTAL_OUTPUT_ROWS * outputFrameSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}
