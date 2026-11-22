// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArtwallUpgradeable} from "./ArtwallUpgradeable.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title ArtworkRegistry
 * @notice §19/§79 contract 1 of 5. On-chain artwork identity: the token id,
 *         its current owner, a metadata commitment, ERC-2981 royalty config
 *         and the hash of the NFC tag bound to the physical piece.
 *
 * @dev §80 — what is deliberately NOT here: raw images, artist KYC, condition
 *      photos, shipping, demand signals, internal notes. Only a
 *      `metadataHash` commitment to the off-chain record, and only the HASH
 *      of the NFC tag uid (never the uid itself, which is a physical
 *      authentication secret).
 *
 *      Rule 29/30 — ownership history is immutable: `transferOwnership`
 *      appends to a per-token append-only array that has no delete path, and
 *      `registerArtwork` reverts for an id that already exists, so an entry
 *      can never be rewritten.
 *
 *      §119/rule 41 — this contract records; it does not decide. The
 *      application gateway (OPERATOR_ROLE) is the policy gate that decides
 *      whether an artwork may be registered at all.
 */
contract ArtworkRegistry is ArtwallUpgradeable, IERC2981 {
    struct Artwork {
        address owner;
        address royaltyReceiver;
        uint96 royaltyBps;
        bytes32 metadataHash;
        bytes32 nfcTagUidHash;
        uint64 registeredAt;
        bool exists;
    }

    struct OwnershipRecord {
        address owner;
        uint64 at;
    }

    /// @dev Same backstop as ArtwallCOA.MAX_ROYALTY_BPS: the real, tunable
    ///      cap lives off-chain in commission_policies, this is defence in
    ///      depth.
    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10%

    mapping(uint256 => Artwork) private _artworks;
    mapping(uint256 => OwnershipRecord[]) private _ownershipHistory;
    /// @dev One artwork per physical tag: a tag hash can only ever bind once.
    mapping(bytes32 => uint256) public artworkByNfcTagHash;
    uint256 public totalRegistered;

    event ArtworkRegistered(
        uint256 indexed tokenId, address indexed owner, bytes32 metadataHash, bytes32 nfcTagUidHash
    );
    event OwnershipTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    event RoyaltyUpdated(uint256 indexed tokenId, address receiver, uint96 bps);
    event NfcTagBound(uint256 indexed tokenId, bytes32 nfcTagUidHash);

    error ArtworkAlreadyExists(uint256 tokenId);
    error UnknownArtwork(uint256 tokenId);
    error RoyaltyAboveCap(uint96 bps);
    error TagAlreadyBound(bytes32 nfcTagUidHash);
    error ZeroAddress();

    function initialize(address admin, address operator) external initializer {
        __ArtwallUpgradeable_init(admin, operator);
    }

    /// @notice Record a new artwork. Reverts if the id is already taken —
    ///         registration is one-shot per token (rule 29/30).
    function registerArtwork(
        uint256 tokenId,
        address owner,
        bytes32 metadataHash,
        bytes32 nfcTagUidHash,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external whenNotPaused onlyOperator {
        if (_artworks[tokenId].exists) revert ArtworkAlreadyExists(tokenId);
        if (owner == address(0)) revert ZeroAddress();
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyAboveCap(royaltyBps);
        if (nfcTagUidHash != bytes32(0)) {
            if (artworkByNfcTagHash[nfcTagUidHash] != 0) revert TagAlreadyBound(nfcTagUidHash);
            artworkByNfcTagHash[nfcTagUidHash] = tokenId;
        }

        _artworks[tokenId] = Artwork({
            owner: owner,
            royaltyReceiver: royaltyReceiver,
            royaltyBps: royaltyBps,
            metadataHash: metadataHash,
            nfcTagUidHash: nfcTagUidHash,
            registeredAt: uint64(block.timestamp),
            exists: true
        });
        _ownershipHistory[tokenId].push(OwnershipRecord({owner: owner, at: uint64(block.timestamp)}));
        totalRegistered++;

        emit ArtworkRegistered(tokenId, owner, metadataHash, nfcTagUidHash);
    }

    /// @notice Append a new owner. The previous record stays — history is
    ///         never rewritten (rule 30).
    function transferOwnership(uint256 tokenId, address to) external whenNotPaused onlyOperator {
        Artwork storage a = _artworks[tokenId];
        if (!a.exists) revert UnknownArtwork(tokenId);
        if (to == address(0)) revert ZeroAddress();
        address from = a.owner;
        a.owner = to;
        _ownershipHistory[tokenId].push(OwnershipRecord({owner: to, at: uint64(block.timestamp)}));
        emit OwnershipTransferred(tokenId, from, to);
    }

    /// @notice Bind the NFC tag hash for an artwork registered without one.
    ///         A tag hash, once set, is never changed — rebinding would
    ///         break the physical-to-digital provenance commitment.
    function bindNfcTag(uint256 tokenId, bytes32 nfcTagUidHash) external whenNotPaused onlyOperator {
        Artwork storage a = _artworks[tokenId];
        if (!a.exists) revert UnknownArtwork(tokenId);
        require(nfcTagUidHash != bytes32(0), "tag hash is zero");
        require(a.nfcTagUidHash == bytes32(0), "tag already set");
        if (artworkByNfcTagHash[nfcTagUidHash] != 0) revert TagAlreadyBound(nfcTagUidHash);
        a.nfcTagUidHash = nfcTagUidHash;
        artworkByNfcTagHash[nfcTagUidHash] = tokenId;
        emit NfcTagBound(tokenId, nfcTagUidHash);
    }

    /// @notice Royalty config IS mutable (unlike history): a receiver address
    ///         can be lost or rotated. Admin-only, not operator — changing
    ///         where money goes is not a routine gateway write.
    function setRoyalty(uint256 tokenId, address receiver, uint96 bps) external whenNotPaused onlyAdmin {
        Artwork storage a = _artworks[tokenId];
        if (!a.exists) revert UnknownArtwork(tokenId);
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyAboveCap(bps);
        a.royaltyReceiver = receiver;
        a.royaltyBps = bps;
        emit RoyaltyUpdated(tokenId, receiver, bps);
    }

    function getArtwork(uint256 tokenId) external view returns (Artwork memory) {
        Artwork memory a = _artworks[tokenId];
        if (!a.exists) revert UnknownArtwork(tokenId);
        return a;
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _artworks[tokenId].exists;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        Artwork storage a = _artworks[tokenId];
        if (!a.exists) revert UnknownArtwork(tokenId);
        return a.owner;
    }

    function ownershipHistory(uint256 tokenId) external view returns (OwnershipRecord[] memory) {
        return _ownershipHistory[tokenId];
    }

    /// @inheritdoc IERC2981
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        Artwork storage a = _artworks[tokenId];
        if (a.royaltyReceiver == address(0)) return (address(0), 0);
        return (a.royaltyReceiver, (salePrice * a.royaltyBps) / 10_000);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
