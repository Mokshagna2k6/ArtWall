// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ArtwallCOA
 * @notice The single ArtWall NFT contract (BC-1.02). ERC-721 + ERC-2981
 *         (OpenZeppelin), minted only via an EIP-712 voucher signed by an
 *         address holding SIGNER_ROLE (BC-1.03). The voucher binds recipient,
 *         royalty receiver, royalty bps, token URI, a per-voucher nonce and
 *         this contract/chain (via the EIP-712 domain separator), so it
 *         cannot be replayed on another chain/contract or redirected to a
 *         different recipient (BC-1.04). Each nonce can mint at most once
 *         (BC-1.05).
 */
contract ArtwallCOA is ERC721, ERC2981, EIP712, AccessControl {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    struct MintVoucher {
        address to;
        string uri;
        address royaltyReceiver;
        uint96 royaltyFeeBps;
        bytes32 nonce;
        uint256 deadline;
    }

    bytes32 private constant MINT_VOUCHER_TYPEHASH = keccak256(
        "MintVoucher(address to,string uri,address royaltyReceiver,uint96 royaltyFeeBps,bytes32 nonce,uint256 deadline)"
    );

    /// @dev Default royalty cap enforced on every mint; the platform policy
    ///      bps passed in the voucher must never exceed this (defence in
    ///      depth — the real cap is enforced off-chain by commission_policies,
    ///      this is the on-chain backstop).
    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10%

    uint256 private _nextTokenId = 1;
    uint256 public totalMinted;

    mapping(bytes32 => bool) public usedNonces;
    mapping(uint256 => string) private _tokenUris;

    /// @dev Batched provenance anchoring (BC-1.02 consolidation): a daily
    ///      Merkle root over pending mint commitments, committed by the
    ///      platform signer, independent of any individual NFT mint. This is
    ///      the "blockchain anchored" signal for artworks that have not
    ///      (yet) minted a full certificate NFT.
    mapping(bytes32 => bool) public committedRoots;

    event CertificateMinted(uint256 indexed tokenId, address indexed to, string uri);
    event RootCommitted(bytes32 indexed root);

    constructor(address admin, address signer)
        ERC721("ArtwallCOA", "ARTW")
        EIP712("ArtwallCOA", "1")
    {
        require(admin != address(0), "admin is zero address");
        require(signer != address(0), "signer is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
    }

    /// @notice Mint a certificate NFT authorized by an EIP-712 voucher signed
    ///         by a SIGNER_ROLE holder. Reverts on expired deadline, reused
    ///         nonce, zero recipient, or a bad signature (BC-1.03–1.05).
    function mintWithVoucher(MintVoucher calldata voucher, bytes calldata signature)
        external
        returns (uint256 tokenId)
    {
        require(block.timestamp <= voucher.deadline, "voucher expired");
        require(!usedNonces[voucher.nonce], "nonce already used");
        require(voucher.to != address(0), "mint to zero address");
        require(voucher.royaltyFeeBps <= MAX_ROYALTY_BPS, "royalty exceeds cap");

        bytes32 structHash = keccak256(
            abi.encode(
                MINT_VOUCHER_TYPEHASH,
                voucher.to,
                keccak256(bytes(voucher.uri)),
                voucher.royaltyReceiver,
                voucher.royaltyFeeBps,
                voucher.nonce,
                voucher.deadline
            )
        );
        address recoveredSigner = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(hasRole(SIGNER_ROLE, recoveredSigner), "invalid voucher signature");

        usedNonces[voucher.nonce] = true;

        tokenId = _nextTokenId++;
        totalMinted++;
        _tokenUris[tokenId] = voucher.uri;

        // BC-2.03 (Slither reentrancy-benign/reentrancy-events): state writes
        // and the mint event are ordered before the external call
        // (_safeMint's onERC721Received callback to the recipient), so a
        // malicious recipient contract can observe no inconsistent
        // intermediate state and cannot reorder/fabricate this event.
        if (voucher.royaltyReceiver != address(0)) {
            _setTokenRoyalty(tokenId, voucher.royaltyReceiver, voucher.royaltyFeeBps);
        }
        emit CertificateMinted(tokenId, voucher.to, voucher.uri);

        _safeMint(voucher.to, tokenId);
    }

    /// @notice Commit a batched Merkle root of pending mint commitments
    ///         on-chain (platform-signer only). Idempotent per root hash.
    function commitRoot(bytes32 root) external {
        require(hasRole(SIGNER_ROLE, msg.sender), "not signer");
        require(!committedRoots[root], "root already committed");
        committedRoots[root] = true;
        emit RootCommitted(root);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenUris[tokenId];
    }

    /// @notice Burning is disallowed entirely — a COA represents permanent
    ///         provenance (BC-1.07). No burn function is exposed.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        require(to != address(0) || _ownerOf(tokenId) == address(0), "burning is disabled");
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
