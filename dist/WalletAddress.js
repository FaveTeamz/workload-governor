"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateAddress = truncateAddress;
exports.WalletAddress = WalletAddress;
const react_1 = __importStar(require("react"));
/** Truncates a Stellar address to GABC...WXYZ format. */
function truncateAddress(address) {
    if (!address || address.length <= 8)
        return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
/**
 * Displays a Stellar wallet address truncated to first 4 + last 4 chars.
 * - Hover tooltip shows the full address.
 * - Copy button copies the full address; shows a checkmark for 1.5 s.
 */
function WalletAddress({ address }) {
    const [copied, setCopied] = (0, react_1.useState)(false);
    async function handleCopy() {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }
    return (<span className="wallet-address" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
      <span title={address} style={{ fontFamily: 'monospace', cursor: 'default' }}>
        {truncateAddress(address)}
      </span>
      <button type="button" onClick={handleCopy} aria-label={`Copy address ${address}`} title="Copy address" style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
            color: 'inherit',
        }}>
        {copied ? '✓' : '⧉'}
      </button>
    </span>);
}
