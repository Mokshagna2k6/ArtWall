// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArtworkRegistry
 * @notice ERC-721 + ERC-2981 for ArtWall artworks.
 *         Lazy-mint pattern: platform commits daily Merkle roots,
 *         artists mint from proof on demand.
 *
 * Simplified for MVP — no OpenZeppelin dependency (saves Foundry setup).
 * Implements ERC-165, ERC-721 (minimal), ERC-2981.
 */
contract ArtworkRegistry {
    // ── State ──────────────────────────────────────────────────────────────

    string public name = "ArtWall";
    string public symbol = "ARTW";

    address public immutable signer;
    string public baseURI;

    mapping(bytes32 => bool) public committedRoots;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    struct RoyaltyInfo {
        address receiver;
        uint96 bps; // basis points (max 10000 = 100%)
    }
    mapping(uint256 => RoyaltyInfo) private _royalties;

    uint256 public totalSupply;

    // ── Events ─────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event RootCommitted(bytes32 indexed root);
    event ArtworkMinted(uint256 indexed tokenId, address indexed to, bytes32 leaf);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _signer, string memory _baseURI) {
        signer = _signer;
        baseURI = _baseURI;
    }

    // ── Root management (platform only) ────────────────────────────────────

    function commitRoot(bytes32 root) external {
        require(msg.sender == signer, "Not signer");
        require(!committedRoots[root], "Already committed");
        committedRoots[root] = true;
        emit RootCommitted(root);
    }

    // ── Lazy mint from Merkle proof ────────────────────────────────────────

    function mint(
        address to,
        uint256 tokenId,
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 root,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external {
        require(committedRoots[root], "Root not committed");
        require(ownerOf[tokenId] == address(0), "Already minted");
        require(_verify(leaf, proof, root), "Invalid proof");
        require(royaltyBps <= 1000, "Royalty > 10%");

        ownerOf[tokenId] = to;
        balanceOf[to]++;
        totalSupply++;

        _royalties[tokenId] = RoyaltyInfo(royaltyReceiver, royaltyBps);

        emit Transfer(address(0), to, tokenId);
        emit ArtworkMinted(tokenId, to, leaf);
    }

    // ── ERC-721 transfers ──────────────────────────────────────────────────

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "Not owner");
        require(
            msg.sender == from ||
            msg.sender == getApproved[tokenId] ||
            isApprovedForAll[from][msg.sender],
            "Not approved"
        );
        _transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf[tokenId];
        require(msg.sender == owner || isApprovedForAll[owner][msg.sender], "Not approved");
        getApproved[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ── ERC-2981 ───────────────────────────────────────────────────────────

    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external view returns (address receiver, uint256 royaltyAmount)
    {
        RoyaltyInfo memory r = _royalties[tokenId];
        return (r.receiver, (salePrice * r.bps) / 10000);
    }

    // ── ERC-165 ────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x2a55205a || // ERC-2981
            interfaceId == 0x01ffc9a7;   // ERC-165
    }

    // ── Token URI ──────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(ownerOf[tokenId] != address(0), "Not minted");
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 tokenId) internal {
        ownerOf[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        delete getApproved[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function _verify(bytes32 leaf, bytes32[] calldata proof, bytes32 root)
        internal pure returns (bool)
    {
        bytes32 hash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            hash = hash < sibling
                ? keccak256(abi.encodePacked(hash, sibling))
                : keccak256(abi.encodePacked(sibling, hash));
        }
        return hash == root;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
