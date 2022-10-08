// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.13;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

/**
 * @title Vault
 * @dev Store ERC-20 tokens in a vault that unlocks after a certain amount of time
 */
contract Vault {

    address public _owner;
    address public _tokenaddress;
    address payable public _recipient;
    uint256 public _unlock;
    uint256 public _amount;
    uint256 public _maxvest;
    bool public isFunded;
    IERC20 public _token;

    /**
     * @dev Set benefactor and lock time
     * @param recipient benefactor of the Vault tokens or ETH
     */
    constructor(address payable recipient) {
        _owner = msg.sender;
        _recipient = recipient;
        _maxvest = 5000;
    }

    /**
     * @dev Fund the contract with ERC-20 tokens as the owner
     * @param tokenaddress address of ERC20 token to fund the contract with
     * @param amount of tokens to send to the vault contract
     * @param locktime length of lock (in number of blocks) to keep the tokens locked
     */
    function fund_token(address tokenaddress, uint256 amount, uint256 locktime) public {
        require(msg.sender == _owner, "Only the owner of the contract can call this method");
        require(isFunded == false, "Cannot fund contract twice");
        require(amount > 0, "Cannot deposit an empty or negative amount of tokens");
        require(locktime > 0, "Cannot lock for 0 or negative blocks");
        require(locktime <= _maxvest, "Cannot lock for more than max vesting time");

        // Transfer tokens to contract
        _token = IERC20(tokenaddress);
        assert(_token.balanceOf(msg.sender) >= amount);
        _token.transferFrom(msg.sender, address(this), amount);

        _tokenaddress = tokenaddress;
        _amount = amount;
        isFunded = true;
        _unlock = block.number + locktime;
    }

    /**
     * @dev Fund the contract with ETH as the owner of the contract
     * @param locktime length of lock (in number of blocks) to keep the ETH locked
     */
    function fund_eth(uint256 locktime) public payable {
        require(msg.sender == _owner, "Only the owner of the contract can call this method");
        require(isFunded == false, "Cannot fund contract twice");
        require(msg.value > 0, "Cannot deposit an empty or negative amount of tokens");
        require(locktime > 0, "Cannot lock for 0 or negative blocks");
        require(locktime <= _maxvest, "Cannot lock for more than max vesting time");

        isFunded = true;
        _unlock = block.number + locktime;
    }

    /**
    * @dev withdraw ERC20 tokens from the contract as the recipient
    */
    function withdraw_token() public {
        require(msg.sender == _recipient, "Only the owner of the contract can call this method");
        require(isFunded, "Contract needs to be funded in order to withdraw ETH");
        require(block.number >= _unlock, "Cannot withdraw ETH before unlock time has passed");

        _token = IERC20(_tokenaddress);
        _token.transfer(_recipient, _amount);
    }

    /**
    * @dev withdraw ETH from the contract as the recipient
    */
    function withdraw_eth() public {
        require(msg.sender == _recipient, "Only the owner of the contract can call this method");
        require(isFunded, "Contract needs to be funded in order to withdraw ETH");
        require(block.number >= _unlock, "Cannot withdraw ETH before unlock time has passed");

        _recipient.transfer(address(this).balance);
    }
}