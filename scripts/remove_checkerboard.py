#!/usr/bin/env python3
"""Remove baked-in gray checkerboard backgrounds from AI-exported PNG assets."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def estimate_background_colors(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = rgb.shape
    margin = max(18, min(h, w) // 20)
    samples = np.concatenate(
        [
            rgb[:margin, :, :].reshape(-1, 3),
            rgb[-margin:, :, :].reshape(-1, 3),
            rgb[:, :margin, :].reshape(-1, 3),
            rgb[:, -margin:, :].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.float32)

    # The fake transparency grid is nearly neutral gray. Ignore warm illustration
    # pixels that touch the edge, then split the remaining samples into light/dark squares.
    channel_spread = samples.max(axis=1) - samples.min(axis=1)
    neutral_samples = samples[channel_spread < 10]
    if len(neutral_samples) < 100:
        neutral_samples = samples

    brightness = neutral_samples.mean(axis=1)
    dark = neutral_samples[brightness <= np.percentile(brightness, 45)]
    light = neutral_samples[brightness >= np.percentile(brightness, 55)]
    if len(dark) == 0 or len(light) == 0:
        median = np.median(neutral_samples, axis=0)
        return median, median
    return dark.mean(axis=0), light.mean(axis=0)


def make_alpha(rgb: np.ndarray, bg_dark: np.ndarray, bg_light: np.ndarray) -> np.ndarray:
    rgb_f = rgb.astype(np.float32)
    dist_dark = np.linalg.norm(rgb_f - bg_dark, axis=2)
    dist_light = np.linalg.norm(rgb_f - bg_light, axis=2)
    dist = np.minimum(dist_dark, dist_light)

    # Keep cream paper and olive/brown illustration pixels solid, but let soft
    # shadows/anti-aliased edges become partial alpha.
    alpha = (dist - 8.0) / 44.0
    alpha = np.clip(alpha, 0.0, 1.0)
    alpha = alpha * alpha * (3.0 - 2.0 * alpha)

    alpha_img = Image.fromarray(np.uint8(alpha * 255), mode="L")
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=0.7))
    alpha = np.asarray(alpha_img).astype(np.float32) / 255.0

    # Remove tiny isolated checkerboard residue in the empty canvas.
    alpha[alpha < 0.035] = 0.0
    alpha[alpha > 0.94] = 1.0
    return alpha


def recover_foreground(rgb: np.ndarray, alpha: np.ndarray, bg_dark: np.ndarray, bg_light: np.ndarray) -> np.ndarray:
    rgb_f = rgb.astype(np.float32)
    dist_dark = np.linalg.norm(rgb_f - bg_dark, axis=2)
    dist_light = np.linalg.norm(rgb_f - bg_light, axis=2)
    bg = np.where((dist_dark <= dist_light)[..., None], bg_dark, bg_light)

    safe_alpha = np.clip(alpha[..., None], 0.08, 1.0)
    recovered = (rgb_f - (1.0 - safe_alpha) * bg) / safe_alpha
    recovered = np.clip(recovered, 0, 255)

    # Fully opaque pixels keep their original texture; partial pixels get the
    # decontaminated color so the checker pattern does not show on edges.
    mix = np.clip((1.0 - alpha[..., None]) * 1.35, 0, 1)
    return rgb_f * (1.0 - mix) + recovered * mix


def remove_checkerboard(input_path: Path, output_path: Path) -> None:
    image = Image.open(input_path).convert("RGB")
    rgb = np.asarray(image)
    bg_dark, bg_light = estimate_background_colors(rgb)
    alpha = make_alpha(rgb, bg_dark, bg_light)
    foreground = recover_foreground(rgb, alpha, bg_dark, bg_light)

    rgba = np.dstack([foreground, alpha * 255]).astype(np.uint8)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    remove_checkerboard(args.input, args.output)


if __name__ == "__main__":
    main()
