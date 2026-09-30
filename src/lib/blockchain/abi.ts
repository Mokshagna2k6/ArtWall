// ABI for the ArtwallCOA ERC-721 contract + EIP-712 voucher types.
export const artwallCoaAbi = [
  {
    type: "function",
    name: "mintWithVoucher",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "to", type: "address" },
          { name: "uri", type: "string" },
          { name: "royaltyReceiver", type: "address" },
          { name: "royaltyFeeBps", type: "uint96" },
          { name: "nonce", type: "bytes32" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "event",
    name: "CertificateMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "uri", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const MINT_VOUCHER_DOMAIN = { name: "ArtwallCOA", version: "1" } as const;
export const MINT_VOUCHER_TYPES = {
  MintVoucher: [
    { name: "to", type: "address" },
    { name: "uri", type: "string" },
    { name: "royaltyReceiver", type: "address" },
    { name: "royaltyFeeBps", type: "uint96" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
