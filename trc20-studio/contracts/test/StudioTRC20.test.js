const { expect } = require("chai");
const { ethers } = require("hardhat");

const D = 6n;
const unit = (n) => BigInt(n) * 10n ** D;

async function deploy({ mintable = false, cap = 0n, supply = unit(1_000_000) } = {}) {
  const [deployer, alice, bob] = await ethers.getSigners();
  const F = await ethers.getContractFactory("StudioTRC20");
  const token = await F.deploy("Acme Points", "ACME", Number(D), supply, mintable, cap);
  await token.waitForDeployment();
  return { token, deployer, alice, bob };
}

describe("StudioTRC20 — metadata & supply", () => {
  it("sets name, symbol, decimals and mints initial supply to deployer", async () => {
    const { token, deployer } = await deploy();
    expect(await token.name()).to.equal("Acme Points");
    expect(await token.symbol()).to.equal("ACME");
    expect(await token.decimals()).to.equal(6);
    expect(await token.totalSupply()).to.equal(unit(1_000_000));
    expect(await token.balanceOf(deployer.address)).to.equal(unit(1_000_000));
  });

  it("rejects decimals above 18", async () => {
    const F = await ethers.getContractFactory("StudioTRC20");
    await expect(F.deploy("X", "X", 19, 1, false, 0)).to.be.revertedWithCustomError(F, "InvalidDecimals");
  });

  it("rejects a cap on fixed-supply tokens and a cap below initial supply", async () => {
    const F = await ethers.getContractFactory("StudioTRC20");
    await expect(F.deploy("X", "X", 6, 100, false, 1000)).to.be.revertedWithCustomError(F, "InvalidCap");
    await expect(F.deploy("X", "X", 6, 1000, true, 100)).to.be.revertedWithCustomError(F, "CapExceeded");
  });
});

describe("StudioTRC20 — fixed supply has no admin surface", () => {
  it("has no owner and reports mintable() = false", async () => {
    const { token } = await deploy();
    expect(await token.owner()).to.equal(ethers.ZeroAddress);
    expect(await token.mintable()).to.equal(false);
    expect(await token.deployedAsMintable()).to.equal(false);
  });

  it("mint always reverts, even for the deployer", async () => {
    const { token, deployer } = await deploy();
    await expect(token.mint(deployer.address, 1)).to.be.revertedWithCustomError(token, "MintingDisabled");
  });

  it("ownership functions revert", async () => {
    const { token, alice } = await deploy();
    await expect(token.transferOwnership(alice.address)).to.be.revertedWithCustomError(token, "NotOwner");
    await expect(token.renounceOwnership()).to.be.revertedWithCustomError(token, "NotOwner");
  });
});

describe("StudioTRC20 — transfers", () => {
  it("moves balances and emits Transfer", async () => {
    const { token, deployer, alice } = await deploy();
    await expect(token.transfer(alice.address, unit(10)))
      .to.emit(token, "Transfer").withArgs(deployer.address, alice.address, unit(10));
    expect(await token.balanceOf(alice.address)).to.equal(unit(10));
  });

  it("reverts on insufficient balance and zero address", async () => {
    const { token, alice, bob } = await deploy();
    await expect(token.connect(alice).transfer(bob.address, 1)).to.be.revertedWithCustomError(token, "InsufficientBalance");
    await expect(token.transfer(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(token, "ZeroAddress");
  });

  it("cannot move another holder's tokens without allowance", async () => {
    const { token, deployer, alice, bob } = await deploy();
    await expect(token.connect(alice).transferFrom(deployer.address, bob.address, 1))
      .to.be.revertedWithCustomError(token, "InsufficientAllowance");
  });
});

describe("StudioTRC20 — allowances", () => {
  it("approve + transferFrom spends allowance", async () => {
    const { token, deployer, alice, bob } = await deploy();
    await token.approve(alice.address, unit(5));
    await token.connect(alice).transferFrom(deployer.address, bob.address, unit(3));
    expect(await token.allowance(deployer.address, alice.address)).to.equal(unit(2));
    expect(await token.balanceOf(bob.address)).to.equal(unit(3));
  });

  it("infinite allowance is not decremented", async () => {
    const { token, deployer, alice, bob } = await deploy();
    await token.approve(alice.address, ethers.MaxUint256);
    await token.connect(alice).transferFrom(deployer.address, bob.address, unit(3));
    expect(await token.allowance(deployer.address, alice.address)).to.equal(ethers.MaxUint256);
  });

  it("increase/decrease allowance", async () => {
    const { token, deployer, alice } = await deploy();
    await token.increaseAllowance(alice.address, 10);
    await token.decreaseAllowance(alice.address, 4);
    expect(await token.allowance(deployer.address, alice.address)).to.equal(6);
    await expect(token.decreaseAllowance(alice.address, 7)).to.be.revertedWithCustomError(token, "InsufficientAllowance");
  });
});

describe("StudioTRC20 — burn", () => {
  it("holder burns own tokens and supply drops", async () => {
    const { token, deployer } = await deploy();
    await token.burn(unit(100));
    expect(await token.totalSupply()).to.equal(unit(999_900));
    expect(await token.balanceOf(deployer.address)).to.equal(unit(999_900));
  });

  it("cannot burn more than held", async () => {
    const { token, alice } = await deploy();
    await expect(token.connect(alice).burn(1)).to.be.revertedWithCustomError(token, "InsufficientBalance");
  });
});

describe("StudioTRC20 — mintable mode", () => {
  it("owner can mint up to cap, not beyond", async () => {
    const { token, alice } = await deploy({ mintable: true, cap: unit(1_000_100) });
    expect(await token.mintable()).to.equal(true);
    await token.mint(alice.address, unit(100));
    expect(await token.totalSupply()).to.equal(unit(1_000_100));
    await expect(token.mint(alice.address, 1)).to.be.revertedWithCustomError(token, "CapExceeded");
  });

  it("non-owner cannot mint", async () => {
    const { token, alice } = await deploy({ mintable: true });
    await expect(token.connect(alice).mint(alice.address, 1)).to.be.revertedWithCustomError(token, "NotOwner");
  });

  it("renounce permanently disables minting", async () => {
    const { token, deployer } = await deploy({ mintable: true });
    await token.renounceOwnership();
    expect(await token.mintable()).to.equal(false);
    expect(await token.deployedAsMintable()).to.equal(true);
    await expect(token.mint(deployer.address, 1)).to.be.revertedWithCustomError(token, "NotOwner");
  });

  it("ownership transfer moves mint rights", async () => {
    const { token, deployer, alice } = await deploy({ mintable: true });
    await token.transferOwnership(alice.address);
    await expect(token.mint(deployer.address, 1)).to.be.revertedWithCustomError(token, "NotOwner");
    await token.connect(alice).mint(alice.address, 1);
  });
});
