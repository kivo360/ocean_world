import type { World } from "./world";

export function auditWorld(w: World): { moneyTotal: number; goodsTotal: number } {
  let moneyTotal = 0;
  let goodsTotal = 0;

  for (const entity of w.entities.values()) {
    const financial = entity.components.financial;
    if (financial) {
      moneyTotal += financial.money;
      goodsTotal += financial.goods;
    }
  }

  return { moneyTotal, goodsTotal };
}