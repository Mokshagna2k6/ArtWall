// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArtwallUpgradeable} from "./ArtwallUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueDistributor
 * @notice §19/§79 contract 4 of 5. Splits a sale across platform, artist,
 *         wall owner, curator and the original artist's resale royalty —
 *         atomically. Either every party is paid in this one transaction, or
 *         nothing moves.
 *
 * @dev Atomicity: every leg is a push via low-level `call`, and a failed leg
 *      reverts the whole transaction (PayoutFailed). There is no partial
 *      path and no "pull the rest later" escrow, so an observer can never see
 *      three of five parties paid. The trade-off is that one unpayable
 *      recipient (a contract that rejects ETH, or one whose receive() runs
 *      out of the forwarded gas) blocks the sale — that is the intended
 *      failure mode: better a refused sale than a half-executed one. The
 *      application resolves such a recipient off-chain and retries.
 *      shortcut: a recipient that always reverts blocks its artwork's sales
 *      until the gateway updates the address; add a pull-escrow fallback only
 *      if that is ever observed, since it would weaken the all-or-none
 *      guarantee.
 *
 *      Rule 29/30 — price history is immutable: every distribution appends a
 *      Distribution record keyed by a caller-supplied saleId that can never
 *      be reused or rewritten.
 *
 *      §118 amount cap: `maxSaleValue` bounds a single distribution, so a
 *      compromised operator cannot push an unbounded amount through in one
 *      transaction.
 *
 *      §80 — no buyer identity, no KYC, no order data. Only addresses,
 *      amounts and a saleId that commits to the off-chain order.
 */
contract RevenueDistributor is ArtwallUpgradeable, ReentrancyGuard {
    struct Split {
        address platform;
        address artist;
        address wallOwner;
        address curator;
        address originalArtist;
        uint16 platformBps;
        uint16 artistBps;
        uint16 wallOwnerBps;
        uint16 curatorBps;
        uint16 originalArtistBps;
    }

    struct Distribution {
        uint256 artworkTokenId;
        uint256 totalAmount;
        uint64 at;
        bool exists;
    }

    uint16 private constant BPS_DENOMINATOR = 10_000;

    /// @dev §118 rate/amount cap. Admin-tunable because a sensible ceiling is
    ///      a business number, unlike the upgrade timelock.
    uint256 public maxSaleValue;

    mapping(bytes32 => Distribution) private _distributions;
    /// @notice Immutable per-artwork price history (rule 29).
    mapping(uint256 => uint256[]) private _priceHistory;
    uint256 public totalDistributed;

    event Distributed(bytes32 indexed saleId, uint256 indexed artworkTokenId, uint256 totalAmount);
    event Paid(bytes32 indexed saleId, address indexed to, uint256 amount);
    event MaxSaleValueUpdated(uint256 maxSaleValue);

    error SaleAlreadyDistributed(bytes32 saleId);
    error UnknownSale(bytes32 saleId);
    error BpsMustSumTo10000(uint256 sum);
    error AmountAboveCap(uint256 amount, uint256 cap);
    error ValueMismatch(uint256 sent, uint256 expected);
    error PayoutFailed(address to, uint256 amount);
    error ZeroAmount();

    /// @dev OZ's non-upgradeable ReentrancyGuard sets `_status = NOT_ENTERED`
    ///      in its constructor, which a proxy's storage never sees — so
    ///      behind the proxy `_status` starts at 0. The guard still works
    ///      (it only compares against ENTERED); the first distribute() just
    ///      pays the cold-slot gas. Not worth vendoring an upgradeable copy.
    function initialize(address admin, address operator, uint256 maxSaleValue_) external initializer {
        __ArtwallUpgradeable_init(admin, operator);
        maxSaleValue = maxSaleValue_;
    }

    function setMaxSaleValue(uint256 maxSaleValue_) external onlyAdmin {
        maxSaleValue = maxSaleValue_;
        emit MaxSaleValueUpdated(maxSaleValue_);
    }

    /**
     * @notice Split `msg.value` across the five parties. All or none.
     * @param saleId Commitment to the off-chain order; single-use.
     * @dev Dust from integer division goes to the platform leg, which is
     *      computed as the remainder rather than from bps, so the sum of the
     *      legs always equals msg.value exactly — no wei can be stranded in
     *      the contract.
     */
    function distribute(bytes32 saleId, uint256 artworkTokenId, Split calldata split)
        external
        payable
        whenNotPaused
        onlyOperator
        nonReentrant
    {
        if (_distributions[saleId].exists) revert SaleAlreadyDistributed(saleId);
        if (msg.value == 0) revert ZeroAmount();
        if (maxSaleValue != 0 && msg.value > maxSaleValue) revert AmountAboveCap(msg.value, maxSaleValue);

        uint256 sum = uint256(split.platformBps) + split.artistBps + split.wallOwnerBps + split.curatorBps
            + split.originalArtistBps;
        if (sum != BPS_DENOMINATOR) revert BpsMustSumTo10000(sum);

        // Record before paying: the external calls below are the only
        // reentrancy surface, and the state they could observe is already
        // final (plus nonReentrant).
        _distributions[saleId] =
            Distribution({artworkTokenId: artworkTokenId, totalAmount: msg.value, at: uint64(block.timestamp), exists: true});
        _priceHistory[artworkTokenId].push(msg.value);
        totalDistributed += msg.value;
        emit Distributed(saleId, artworkTokenId, msg.value);

        uint256 paid;
        paid += _pay(saleId, split.artist, (msg.value * split.artistBps) / BPS_DENOMINATOR);
        paid += _pay(saleId, split.wallOwner, (msg.value * split.wallOwnerBps) / BPS_DENOMINATOR);
        paid += _pay(saleId, split.curator, (msg.value * split.curatorBps) / BPS_DENOMINATOR);
        paid += _pay(saleId, split.originalArtist, (msg.value * split.originalArtistBps) / BPS_DENOMINATOR);

        // Platform takes the remainder, so legs sum to msg.value exactly.
        uint256 platformAmount = msg.value - paid;
        if (platformAmount > 0) {
            if (split.platform == address(0)) revert PayoutFailed(address(0), platformAmount);
            _send(saleId, split.platform, platformAmount);
        }
    }

    function getDistribution(bytes32 saleId) external view returns (Distribution memory) {
        Distribution memory d = _distributions[saleId];
        if (!d.exists) revert UnknownSale(saleId);
        return d;
    }

    function priceHistory(uint256 artworkTokenId) external view returns (uint256[] memory) {
        return _priceHistory[artworkTokenId];
    }

    /// @dev A zero-bps party may legitimately have a zero address (no
    ///      curator on this sale). A nonzero amount to a zero address is a
    ///      misconfiguration and reverts the whole distribution.
    function _pay(bytes32 saleId, address to, uint256 amount) private returns (uint256) {
        if (amount == 0) return 0;
        if (to == address(0)) revert PayoutFailed(to, amount);
        _send(saleId, to, amount);
        return amount;
    }

    function _send(bytes32 saleId, address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayoutFailed(to, amount);
        emit Paid(saleId, to, amount);
    }
}
