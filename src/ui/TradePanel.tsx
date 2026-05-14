// (#42) Trade UI sliders. Lets the player propose a goods+money swap to the
// currently selected NPC. Renders inside the interaction menu when "Trade"
// is the active tab. The actual settlement is handled by playerOfferTrade.

import { useState } from "react";

type TradePanelProps = {
  partnerName: string;
  playerGoods: number;
  playerMoney: number;
  onOffer: (goods: number, money: number) => void;
  onClose: () => void;
};

const sliderStyle: React.CSSProperties = {
  width: 160,
  accentColor: "#22d3ee",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#cfe3ff",
  letterSpacing: 0.3,
  minWidth: 60,
};

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  color: "#fbbf24",
  minWidth: 26,
  textAlign: "right",
};

export function TradePanel({ partnerName, playerGoods, playerMoney, onOffer, onClose }: TradePanelProps) {
  const [goods, setGoods] = useState(0);
  const [money, setMoney] = useState(0);
  const valid = (goods > 0 || money > 0) && goods <= playerGoods && money <= playerMoney;
  const partnerReturns = `${money}g + ${goods * 4}¢`;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        padding: 12,
        background: "#0b1220",
        border: "1px solid #22d3ee",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        zIndex: 10,
        minWidth: 260,
      }}
    >
      <div style={{ fontSize: 12, color: "#cfe3ff", marginBottom: 8, letterSpacing: 0.3 }}>
        Trade with <b>{partnerName}</b>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>You give</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, playerGoods)}
          value={goods}
          onChange={(e) => setGoods(Number(e.target.value))}
          style={sliderStyle}
        />
        <span style={valueStyle}>{goods}g</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>You pay</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, playerMoney)}
          value={money}
          onChange={(e) => setMoney(Number(e.target.value))}
          style={sliderStyle}
        />
        <span style={valueStyle}>{money}¢</span>
      </div>

      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, marginBottom: 8 }}>
        Partner returns ≈ {partnerReturns}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onOffer(goods, money)}
          disabled={!valid}
          style={{
            fontSize: 11,
            padding: "4px 12px",
            borderRadius: 6,
            border: `1px solid ${valid ? "#22d3ee" : "#334155"}`,
            background: valid ? "#155e75" : "#1e293b",
            color: valid ? "#cfe3ff" : "#64748b",
            cursor: valid ? "pointer" : "not-allowed",
          }}
        >
          Offer trade
        </button>
        <button
          onClick={onClose}
          style={{
            fontSize: 11,
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#cfe3ff",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
