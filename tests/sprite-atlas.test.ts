import { describe, it, expect, beforeEach } from "vitest";
import { pickAnimation, SpriteAtlas, AnimationSpec, AtlasManifest } from "../src/renderer/sprite-atlas";
import { Texture, Rectangle } from "pixi.js";

// Helper to create a mock AtlasManifest for deterministic testing
function createMockManifest(): AtlasManifest {
  return {
    version: 1,
    atlasFile: "test-atlas.png",
    atlasWidth: 256,
    atlasHeight: 256,
    layout: {
      frameWidth: 32,
      frameHeight: 32,
      animations: {
        idle: {
          row: 0,
          frames: 4,
          loop: true,
          frameDurationMs: 400,
        },
        "walk-e": {
          row: 1,
          frames: 4,
          loop: true,
          frameDurationMs: 200,
        },
        "walk-w": {
          row: 2,
          frames: 4,
          loop: true,
          frameDurationMs: 200,
        },
        "walk-s": {
          row: 3,
          frames: 4,
          loop: true,
          frameDurationMs: 200,
        },
        "walk-n": {
          row: 4,
          frames: 4,
          loop: true,
          frameDurationMs: 200,
        },
      },
    },
    characters: [
      {
        id: "test-char-1",
        x: 0,
        y: 0,
        sheetWidth: 128,
        sheetHeight: 160,
      },
      {
        id: "test-char-2",
        x: 128,
        y: 0,
        sheetWidth: 128,
        sheetHeight: 160,
      },
    ],
  };
}

// Helper to create a SpriteAtlas instance for testing
// Uses Object.create to bypass the private constructor
function createTestAtlas(baseTexture: Texture, manifest: AtlasManifest): SpriteAtlas {
  const atlas = Object.create(SpriteAtlas.prototype);
  atlas.manifest = manifest;
  atlas.base = baseTexture;
  atlas.cache = new Map<string, Texture>();
  return atlas as SpriteAtlas;
}

describe("pickAnimation", () => {
  it("returns 'idle' when no movement (0, 0)", () => {
    expect(pickAnimation(0, 0)).toBe("idle");
  });

  it("returns 'walk-e' when moving right (positive x)", () => {
    expect(pickAnimation(1, 0)).toBe("walk-e");
  });

  it("returns 'walk-w' when moving left (negative x)", () => {
    expect(pickAnimation(-1, 0)).toBe("walk-w");
  });

  it("returns 'walk-s' when moving down (positive y)", () => {
    expect(pickAnimation(0, 1)).toBe("walk-s");
  });

  it("returns 'walk-n' when moving up (negative y)", () => {
    expect(pickAnimation(0, -1)).toBe("walk-n");
  });

  it("returns horizontal direction when x >= y (diagonal preference)", () => {
    expect(pickAnimation(1, 1)).toBe("walk-e");
    expect(pickAnimation(1, 0.5)).toBe("walk-e");
    expect(pickAnimation(-1, 0.5)).toBe("walk-w");
  });

  it("returns vertical direction when y > x (diagonal preference)", () => {
    expect(pickAnimation(0.5, 1)).toBe("walk-s");
    expect(pickAnimation(0.5, -1)).toBe("walk-n");
  });

  it("returns 'idle' when movement is below custom threshold", () => {
    expect(pickAnimation(0.3, 0, 0.5)).toBe("idle");
    expect(pickAnimation(0, 0.3, 0.5)).toBe("idle");
    expect(pickAnimation(0.2, 0.2, 0.5)).toBe("idle");
  });

  it("returns direction when movement is exactly at threshold", () => {
    expect(pickAnimation(0.5, 0)).toBe("walk-e");
    expect(pickAnimation(-0.5, 0)).toBe("walk-w");
    expect(pickAnimation(0, 0.5)).toBe("walk-s");
    expect(pickAnimation(0, -0.5)).toBe("walk-n");
  });

  it("handles small movements above default threshold", () => {
    expect(pickAnimation(0.6, 0)).toBe("walk-e");
    expect(pickAnimation(0, 0.6)).toBe("walk-s");
  });

  it("handles negative diagonal movements correctly", () => {
    expect(pickAnimation(-1, -0.5)).toBe("walk-w");
    expect(pickAnimation(-0.5, -1)).toBe("walk-n");
  });
});

describe("SpriteAtlas", () => {
  let mockTexture: Texture;
  let mockManifest: AtlasManifest;
  let atlas: SpriteAtlas;

  beforeEach(() => {
    mockTexture = { source: { scaleMode: "linear" } } as unknown as Texture;
    mockManifest = createMockManifest();
    atlas = createTestAtlas(mockTexture, mockManifest);
  });

  describe("hasCharacter", () => {
    it("returns true for existing character", () => {
      expect(atlas.hasCharacter("test-char-1")).toBe(true);
      expect(atlas.hasCharacter("test-char-2")).toBe(true);
    });

    it("returns false for nonexistent character", () => {
      expect(atlas.hasCharacter("nonexistent")).toBe(false);
      expect(atlas.hasCharacter("")).toBe(false);
      expect(atlas.hasCharacter("test-char-3")).toBe(false);
    });
  });

  describe("hasAnimation", () => {
    it("returns true for existing animations", () => {
      expect(atlas.hasAnimation("idle")).toBe(true);
      expect(atlas.hasAnimation("walk-e")).toBe(true);
      expect(atlas.hasAnimation("walk-w")).toBe(true);
      expect(atlas.hasAnimation("walk-s")).toBe(true);
      expect(atlas.hasAnimation("walk-n")).toBe(true);
    });

    it("returns false for nonexistent animation", () => {
      expect(atlas.hasAnimation("nonexistent")).toBe(false);
      expect(atlas.hasAnimation("")).toBe(false);
      expect(atlas.hasAnimation("run")).toBe(false);
      expect(atlas.hasAnimation("jump")).toBe(false);
    });
  });

  describe("animation", () => {
    it("returns AnimationSpec for existing animation", () => {
      const idleSpec = atlas.animation("idle");
      expect(idleSpec).not.toBeNull();
      expect(idleSpec?.row).toBe(0);
      expect(idleSpec?.frames).toBe(4);
      expect(idleSpec?.loop).toBe(true);
      expect(idleSpec?.frameDurationMs).toBe(400);

      const walkE = atlas.animation("walk-e");
      expect(walkE?.row).toBe(1);
      expect(walkE?.frames).toBe(4);
    });

    it("returns null for nonexistent animation", () => {
      expect(atlas.animation("nonexistent")).toBeNull();
      expect(atlas.animation("")).toBeNull();
    });
  });

  describe("frameTexture", () => {
    it("returns null for nonexistent character", () => {
      const tex = atlas.frameTexture("nonexistent", "idle", 0);
      expect(tex).toBeNull();
    });

    it("returns null for nonexistent animation", () => {
      const tex = atlas.frameTexture("test-char-1", "nonexistent", 0);
      expect(tex).toBeNull();
    });

    it("returns texture with correct frame addressing for frame 0", () => {
      const tex = atlas.frameTexture("test-char-1", "idle", 0);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(0);
      expect(tex?.frame?.y).toBe(0);
      expect(tex?.frame?.width).toBe(32);
      expect(tex?.frame?.height).toBe(32);
    });

    it("returns texture with correct frame addressing for frame 2", () => {
      const tex = atlas.frameTexture("test-char-1", "idle", 2);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(64);
      expect(tex?.frame?.y).toBe(0);
    });

    it("returns texture with correct frame addressing for different character", () => {
      const tex = atlas.frameTexture("test-char-2", "idle", 0);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(128);
      expect(tex?.frame?.y).toBe(0);
    });

    it("returns texture with correct row addressing for walk-e animation", () => {
      const tex = atlas.frameTexture("test-char-1", "walk-e", 0);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(0);
      expect(tex?.frame?.y).toBe(32);
    });

    it("returns texture with correct row addressing for walk-s animation", () => {
      const tex = atlas.frameTexture("test-char-1", "walk-s", 0);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.y).toBe(96);
    });

    it("wraps frame index correctly for frameIdx >= frames", () => {
      const tex = atlas.frameTexture("test-char-1", "idle", 5);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(32);
    });

    it("wraps frame index correctly for frameIdx = frames", () => {
      const tex = atlas.frameTexture("test-char-1", "idle", 4);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(0);
    });

    it("wraps negative frame index correctly", () => {
      const tex = atlas.frameTexture("test-char-1", "idle", -1);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(96);
    });

    it("wraps large negative frame index correctly", () => {
      const tex = atlas.frameTexture("test-char-1", "idle", -5);
      expect(tex).not.toBeNull();
      expect(tex?.frame?.x).toBe(96);
    });

    it("caches textures for same character/animation/frame combination", () => {
      const tex1 = atlas.frameTexture("test-char-1", "idle", 0);
      const tex2 = atlas.frameTexture("test-char-1", "idle", 0);
      expect(tex1).toBe(tex2);
    });

    it("returns different textures for different frames", () => {
      const tex1 = atlas.frameTexture("test-char-1", "idle", 0);
      const tex2 = atlas.frameTexture("test-char-1", "idle", 1);
      expect(tex1).not.toBe(tex2);
      expect(tex1?.frame?.x).toBe(0);
      expect(tex2?.frame?.x).toBe(32);
    });

    it("returns different textures for different animations", () => {
      const tex1 = atlas.frameTexture("test-char-1", "idle", 0);
      const tex2 = atlas.frameTexture("test-char-1", "walk-e", 0);
      expect(tex1).not.toBe(tex2);
      expect(tex1?.frame?.y).toBe(0);
      expect(tex2?.frame?.y).toBe(32);
    });

    it("returns different textures for different characters", () => {
      const tex1 = atlas.frameTexture("test-char-1", "idle", 0);
      const tex2 = atlas.frameTexture("test-char-2", "idle", 0);
      expect(tex1).not.toBe(tex2);
      expect(tex1?.frame?.x).toBe(0);
      expect(tex2?.frame?.x).toBe(128);
    });
  });
});
