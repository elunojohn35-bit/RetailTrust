import { describe, it, expect, beforeEach } from "vitest";

interface MockContract {
  admin: string;
  paused: boolean;
  totalSupply: bigint;
  balances: Map<string, bigint>;
  staked: Map<string, bigint>;
  lockups: Map<string, bigint>;
  initialized: boolean;
  MAX_SUPPLY: bigint;
  TIER_BRONZE: bigint;
  TIER_SILVER: bigint;
  TIER_GOLD: bigint;
  BRONZE_MINIMUM: bigint;
  SILVER_MINIMUM: bigint;
  GOLD_MINIMUM: bigint;
  LOCKUP_PERIOD: bigint;
  rewardMultipliers: Map<bigint, bigint>;
  blockHeight: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  mint(caller: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  transfer(caller: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  stake(caller: string, amount: bigint, tier: bigint): { value: boolean } | { error: number };
  unstake(caller: string, amount: bigint, tier: bigint): { value: boolean } | { error: number };
  initialize(caller: string): { value: boolean } | { error: number };
  getBalance(account: string): bigint;
  getStaked(account: string, tier: bigint): bigint;
  getLockupEnd(account: string, tier: bigint): bigint;
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  totalSupply: 0n,
  balances: new Map<string, bigint>(),
  staked: new Map<string, bigint>(),
  lockups: new Map<string, bigint>(),
  initialized: false,
  MAX_SUPPLY: 1_000_000_000n,
  TIER_BRONZE: 1n,
  TIER_SILVER: 2n,
  TIER_GOLD: 3n,
  BRONZE_MINIMUM: 1_000n,
  SILVER_MINIMUM: 5_000n,
  GOLD_MINIMUM: 10_000n,
  LOCKUP_PERIOD: 1_440n,
  rewardMultipliers: new Map<bigint, bigint>(),
  blockHeight: 1000n,

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  mint(caller: string, recipient: string, amount: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (amount <= 0n) return { error: 106 };
    if (this.totalSupply + amount > this.MAX_SUPPLY) return { error: 103 };
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.totalSupply += amount;
    return { value: true };
  },

  transfer(caller: string, recipient: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  },

  stake(caller: string, amount: bigint, tier: bigint) {
    if (this.paused) return { error: 104 };
    if (![this.TIER_BRONZE, this.TIER_SILVER, this.TIER_GOLD].includes(tier)) return { error: 108 };
    const tierMinimum = tier === this.TIER_BRONZE ? this.BRONZE_MINIMUM : tier === this.TIER_SILVER ? this.SILVER_MINIMUM : this.GOLD_MINIMUM;
    if (amount < tierMinimum) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    const stakeKey = `${caller}-${tier}`;
    if (this.lockups.has(stakeKey)) return { error: 107 };
    this.balances.set(caller, bal - amount);
    this.staked.set(stakeKey, (this.staked.get(stakeKey) || 0n) + amount);
    this.lockups.set(stakeKey, this.blockHeight + this.LOCKUP_PERIOD);
    return { value: true };
  },

  unstake(caller: string, amount: bigint, tier: bigint) {
    if (this.paused) return { error: 104 };
    if (![this.TIER_BRONZE, this.TIER_SILVER, this.TIER_GOLD].includes(tier)) return { error: 108 };
    if (amount <= 0n) return { error: 106 };
    const stakeKey = `${caller}-${tier}`;
    const stakeBal = this.staked.get(stakeKey) || 0n;
    if (stakeBal < amount) return { error: 102 };
    const lockupEnd = this.lockups.get(stakeKey) || 0n;
    if (this.blockHeight < lockupEnd) return { error: 107 };
    this.staked.set(stakeKey, stakeBal - amount);
    this.balances.set(caller, (this.balances.get(caller) || 0n) + amount);
    if (stakeBal - amount === 0n) this.lockups.delete(stakeKey);
    return { value: true };
  },

  initialize(caller: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.initialized) return { error: 100 };
    this.rewardMultipliers.set(this.TIER_BRONZE, 1n);
    this.rewardMultipliers.set(this.TIER_SILVER, 2n);
    this.rewardMultipliers.set(this.TIER_GOLD, 3n);
    this.initialized = true;
    return { value: true };
  },

  getBalance(account: string): bigint {
    return this.balances.get(account) || 0n;
  },

  getStaked(account: string, tier: bigint): bigint {
    return this.staked.get(`${account}-${tier}`) || 0n;
  },

  getLockupEnd(account: string, tier: bigint): bigint {
    return this.lockups.get(`${account}-${tier}`) || 0n;
  },
};

describe("RetailTrust Loyalty Token", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.totalSupply = 0n;
    mockContract.balances = new Map();
    mockContract.staked = new Map();
    mockContract.lockups = new Map();
    mockContract.initialized = false;
    mockContract.blockHeight = 1000n;
  });

  it("should initialize reward multipliers by admin", () => {
    const result = mockContract.initialize(mockContract.admin);
    expect(result).toEqual({ value: true });
    expect(mockContract.rewardMultipliers.get(mockContract.TIER_BRONZE)).toBe(1n);
    expect(mockContract.rewardMultipliers.get(mockContract.TIER_SILVER)).toBe(2n);
    expect(mockContract.rewardMultipliers.get(mockContract.TIER_GOLD)).toBe(3n);
  });

  it("should prevent non-admin from initializing", () => {
    const result = mockContract.initialize("ST2CY5...");
    expect(result).toEqual({ error: 100 });
  });

  it("should mint tokens when called by admin", () => {
    const result = mockContract.mint(mockContract.admin, "ST2CY5...", 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance("ST2CY5...")).toBe(1000n);
    expect(mockContract.totalSupply).toBe(1000n);
  });

  it("should prevent minting to zero address", () => {
    const result = mockContract.mint(mockContract.admin, "SP000000000000000000002Q6VF78", 1000n);
    expect(result).toEqual({ error: 105 });
  });

  it("should prevent minting over max supply", () => {
    const result = mockContract.mint(mockContract.admin, "ST2CY5...", 2_000_000_000n);
    expect(result).toEqual({ error: 103 });
  });

  it("should transfer tokens", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 500n);
    const result = mockContract.transfer("ST2CY5...", "ST3NB...", 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance("ST2CY5...")).toBe(300n);
    expect(mockContract.getBalance("ST3NB...")).toBe(200n);
  });

  it("should prevent transfer when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.transfer("ST2CY5...", "ST3NB...", 200n);
    expect(result).toEqual({ error: 104 });
  });

  it("should stake tokens for bronze tier", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 2000n);
    const result = mockContract.stake("ST2CY5...", 1000n, mockContract.TIER_BRONZE);
    expect(result).toEqual({ value: true });
    expect(mockContract.getBalance("ST2CY5...")).toBe(1000n);
    expect(mockContract.getStaked("ST2CY5...", mockContract.TIER_BRONZE)).toBe(1000n);
    expect(mockContract.getLockupEnd("ST2CY5...", mockContract.TIER_BRONZE)).toBe(1000n + mockContract.LOCKUP_PERIOD);
  });

  it("should prevent staking with invalid tier", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 2000n);
    const result = mockContract.stake("ST2CY5...", 1000n, 999n);
    expect(result).toEqual({ error: 108 });
  });

  it("should prevent staking below tier minimum", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 2000n);
    const result = mockContract.stake("ST2CY5...", 500n, mockContract.TIER_BRONZE);
    expect(result).toEqual({ error: 106 });
  });

  it("should unstake tokens after lockup", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 2000n);
    mockContract.stake("ST2CY5...", 1000n, mockContract.TIER_BRONZE);
    mockContract.blockHeight = 2440n; // After lockup period
    const result = mockContract.unstake("ST2CY5...", 500n, mockContract.TIER_BRONZE);
    expect(result).toEqual({ value: true });
    expect(mockContract.getStaked("ST2CY5...", mockContract.TIER_BRONZE)).toBe(500n);
    expect(mockContract.getBalance("ST2CY5...")).toBe(1500n);
  });

  it("should prevent unstaking before lockup", () => {
    mockContract.mint(mockContract.admin, "ST2CY5...", 2000n);
    mockContract.stake("ST2CY5...", 1000n, mockContract.TIER_BRONZE);
    const result = mockContract.unstake("ST2CY5...", 500n, mockContract.TIER_BRONZE);
    expect(result).toEqual({ error: 107 });
  });
});