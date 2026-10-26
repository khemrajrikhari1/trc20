// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title StudioTRC20
/// @notice Plain TRC20 (ERC20-compatible) token for the TRON network.
///         - No hidden functions, no balance overrides, no transfer fees, no blacklist.
///         - Supply model is fixed at deployment and readable on-chain via `mintable()`.
///         - Fixed-supply tokens have NO owner: `mint` always reverts, supply can never grow.
///         - Mintable tokens: only the owner can mint, never above `cap()` (0 = uncapped).
///           Renouncing ownership permanently disables minting.
/// @dev    Logic follows the OpenZeppelin ERC20 v4.9 reference, inlined so the contract
///         compiles identically under solc and tron-solc with no external imports.
contract StudioTRC20 {
    string private _name;
    string private _symbol;
    uint8 private immutable _decimals;
    bool private immutable _mintable;
    uint256 private immutable _cap;

    uint256 private _totalSupply;
    address private _owner;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error MintingDisabled();
    error CapExceeded();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidDecimals();
    error InvalidCap();

    modifier onlyOwner() {
        if (msg.sender != _owner || _owner == address(0)) revert NotOwner();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        bool mintable_,
        uint256 cap_
    ) {
        if (decimals_ > 18) revert InvalidDecimals();
        if (!mintable_ && cap_ != 0) revert InvalidCap();
        if (cap_ != 0 && initialSupply_ > cap_) revert CapExceeded();

        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        _mintable = mintable_;
        _cap = cap_;

        if (mintable_) {
            _owner = msg.sender;
            emit OwnershipTransferred(address(0), msg.sender);
        }
        if (initialSupply_ > 0) _mint(msg.sender, initialSupply_);
    }

    // ---- TRC20 views ----
    function name() external view returns (string memory) { return _name; }
    function symbol() external view returns (string memory) { return _symbol; }
    function decimals() external view returns (uint8) { return _decimals; }
    function totalSupply() external view returns (uint256) { return _totalSupply; }
    function balanceOf(address account) external view returns (uint256) { return _balances[account]; }
    function allowance(address holder, address spender) external view returns (uint256) {
        return _allowances[holder][spender];
    }

    // ---- Supply disclosure ----
    /// @notice True only if deployed as mintable AND the owner has not renounced.
    function mintable() public view returns (bool) { return _mintable && _owner != address(0); }
    /// @notice Whether the contract was deployed with minting enabled (never changes).
    function deployedAsMintable() external view returns (bool) { return _mintable; }
    function cap() external view returns (uint256) { return _cap; }
    function owner() external view returns (address) { return _owner; }

    // ---- TRC20 mutations ----
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 current = _allowances[from][msg.sender];
        if (current != type(uint256).max) {
            if (current < amount) revert InsufficientAllowance();
            unchecked { _approve(from, msg.sender, current - amount); }
        }
        _transfer(from, to, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 added) external returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender] + added);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtracted) external returns (bool) {
        uint256 current = _allowances[msg.sender][spender];
        if (current < subtracted) revert InsufficientAllowance();
        unchecked { _approve(msg.sender, spender, current - subtracted); }
        return true;
    }

    /// @notice Holders may burn their own tokens only.
    function burn(uint256 amount) external {
        uint256 bal = _balances[msg.sender];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            _balances[msg.sender] = bal - amount;
            _totalSupply -= amount;
        }
        emit Transfer(msg.sender, address(0), amount);
    }

    // ---- Owner-only (mintable tokens only) ----
    function mint(address to, uint256 amount) external {
        if (!_mintable) revert MintingDisabled();
        if (msg.sender != _owner || _owner == address(0)) revert NotOwner();
        if (_cap != 0 && _totalSupply + amount > _cap) revert CapExceeded();
        _mint(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    /// @notice Permanently removes the owner. Minting can never happen again.
    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    // ---- internals ----
    function _transfer(address from, address to, uint256 amount) internal {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        uint256 bal = _balances[from];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            _balances[from] = bal - amount;
            _balances[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        _totalSupply += amount;
        unchecked { _balances[to] += amount; }
        emit Transfer(address(0), to, amount);
    }

    function _approve(address holder, address spender, uint256 amount) internal {
        if (holder == address(0) || spender == address(0)) revert ZeroAddress();
        _allowances[holder][spender] = amount;
        emit Approval(holder, spender, amount);
    }
}
