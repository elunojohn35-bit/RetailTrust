;; RetailTrust Loyalty Token Contract
;; Clarity v2
;; Implements minting, burning, transferring, tiered staking, and admin controls for a retail loyalty token system

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-STAKE u102)
(define-constant ERR-MAX-SUPPLY-REACHED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-LOCKUP-ACTIVE u107)
(define-constant ERR-INVALID-TIER u108)

;; Token metadata
(define-constant TOKEN-NAME "RetailTrust Loyalty Token")
(define-constant TOKEN-SYMBOL "RTLT")
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-SUPPLY u1000000000) ;; 1B tokens max (decimals accounted separately)

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint u0)

;; Reward tiers configuration
(define-constant TIER-BRONZE u1)
(define-constant TIER-SILVER u2)
(define-constant TIER-GOLD u3)
(define-constant BRONZE-MINIMUM u1000) ;; Minimum tokens for bronze tier
(define-constant SILVER-MINIMUM u5000) ;; Minimum tokens for silver tier
(define-constant GOLD-MINIMUM u10000)  ;; Minimum tokens for gold tier
(define-constant LOCKUP-PERIOD u1440)  ;; ~1 day in blocks (assuming 10min/block)

;; Data maps for balances, stakes, and lockups
(define-map balances principal uint)
(define-map staked-balances { user: principal, tier: uint } uint)
(define-map stake-lockups { user: principal, tier: uint } uint)
(define-map reward-multipliers uint uint) ;; Tier -> multiplier (e.g., 1x, 2x, 3x)

;; Initialize reward multipliers
(define-data-var initialized bool false)
(define-private (initialize-reward-multipliers)
  (begin
    (asserts! (not (var-get initialized)) (err ERR-NOT-AUTHORIZED))
    (map-set reward-multipliers TIER-BRONZE u1)
    (map-set reward-multipliers TIER-SILVER u2)
    (map-set reward-multipliers TIER-GOLD u3)
    (var-set initialized true)
    (ok true)
  )
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate tier
(define-private (is-valid-tier (tier uint))
  (or (is-eq tier TIER-BRONZE) (is-eq tier TIER-SILVER) (is-eq tier TIER-GOLD))
)

;; Private helper: get tier minimum
(define-private (get-tier-minimum (tier uint))
  (if (is-eq tier TIER-BRONZE) BRONZE-MINIMUM
    (if (is-eq tier TIER-SILVER) SILVER-MINIMUM
      (if (is-eq tier TIER-GOLD) GOLD-MINIMUM u0)))
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Mint new tokens
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((new-supply (+ (var-get total-supply) amount)))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (var-set total-supply new-supply)
      (ok true)
    )
  )
)

;; Burn tokens
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (ok true)
    )
  )
)

;; Transfer tokens
(define-public (transfer (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((sender-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- sender-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (ok true)
    )
  )
)

;; Stake tokens for reward tiers
(define-public (stake (amount uint) (tier uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-tier tier) (err ERR-INVALID-TIER))
    (asserts! (>= amount (get-tier-minimum tier)) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (asserts! (is-none (map-get? stake-lockups { user: tx-sender, tier: tier })) (err ERR-LOCKUP-ACTIVE))
      (map-set balances tx-sender (- balance amount))
      (map-set staked-balances { user: tx-sender, tier: tier } (+ amount (default-to u0 (map-get? staked-balances { user: tx-sender, tier: tier }))))
      (map-set stake-lockups { user: tx-sender, tier: tier } (+ block-height LOCKUP-PERIOD))
      (ok true)
    )
  )
)

;; Unstake tokens
(define-public (unstake (amount uint) (tier uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-tier tier) (err ERR-INVALID-TIER))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((stake-balance (default-to u0 (map-get? staked-balances { user: tx-sender, tier: tier })))
          (lockup-end (default-to u0 (map-get? stake-lockups { user: tx-sender, tier: tier }))))
      (asserts! (>= stake-balance amount) (err ERR-INSUFFICIENT-STAKE))
      (asserts! (>= block-height lockup-end) (err ERR-LOCKUP-ACTIVE))
      (map-set staked-balances { user: tx-sender, tier: tier } (- stake-balance amount))
      (map-set balances tx-sender (+ amount (default-to u0 (map-get? balances tx-sender))))
      (if (is-eq (- stake-balance amount) u0)
        (map-delete stake-lockups { user: tx-sender, tier: tier })
        false)
      (ok true)
    )
  )
)

;; Read-only: get balance
(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

;; Read-only: get staked balance
(define-read-only (get-staked (account principal) (tier uint))
  (ok (default-to u0 (map-get? staked-balances { user: account, tier: tier })))
)

;; Read-only: get lockup end
(define-read-only (get-lockup-end (account principal) (tier uint))
  (ok (default-to u0 (map-get? stake-lockups { user: account, tier: tier })))
)

;; Read-only: get total supply
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get reward multiplier
(define-read-only (get-reward-multiplier (tier uint))
  (ok (default-to u1 (map-get? reward-multipliers tier)))
)

;; Initialize contract (called once by admin)
(define-public (initialize)
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (initialize-reward-multipliers)
  )
)