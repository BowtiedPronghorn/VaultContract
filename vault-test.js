const {
    BN,           // Big Number support
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');
const Vault = artifacts.require("Vault");
var ERC20PresetFixedSupply = artifacts.require("ERC20PresetFixedSupply");

contract("Vault", accounts => {
    const owner = accounts[0];
    const recipient = accounts[1];
    const tokenaddress = accounts[3];

    // Construct
    it("Should be owned by the deployer of the contract", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        assert.equal(await vaultInstance._owner(), owner);
    });

    it("Should be deployed with a set recipient", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        assert.equal(await vaultInstance._recipient(), recipient);
    });


    // Fund
    it("Should have a fund method that can only be called by the owner", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        const tokenInstance = await ERC20PresetFixedSupply.new(
            "ERC20 Test Token",
            "T20",
            100000000000,
            tokenaddress,
        );
        tokenInstance.transfer(owner, 10000, {from: tokenaddress});

        // Default value for isFunded is false
        assert.equal(await vaultInstance.isFunded(), false);

        // Cannot call fund() method if not owner
        await expectRevert(vaultInstance.fund_token(tokenaddress, 10, 1, {from: recipient}),
            "Only the owner of the contract can call this method");
    });

    it("Should have a fund method that deposits ERC20 tokens into the contract", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        const tokenInstance = await ERC20PresetFixedSupply.new(
            "ERC20 Test Token",
            "T20",
            100000000000,
            tokenaddress,
        );
        await tokenInstance.transfer(owner, 1000, {from: tokenaddress});
        await tokenInstance.approve(vaultInstance.address, 1000);

        // Calling fund method as owner sets isFunded to true
        await vaultInstance.fund_token(tokenInstance.address, 1000, 1, {from: owner});
        assert.equal(await vaultInstance.isFunded(), true);

        // Calling fund method as owner transfers tokens to contract
        assert.equal(await tokenInstance.balanceOf(owner), 0);
        assert.equal(await tokenInstance.balanceOf(vaultInstance.address), 1000);

        // After this owner can no longer call fund() method
        await expectRevert(vaultInstance.fund_token(tokenaddress, 10, 1, {from: owner}),
            "Cannot fund contract twice");

    });

    it("Should be fundable with ETH that is sent to the Vault contract", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});

        // Assert contract has no ETH
        assert.equal(await web3.eth.getBalance(vaultInstance.address), 0);

        // Transfer ETH to contract as owner
        await vaultInstance.fund_eth(5, {from: owner, value: 1})
        assert.equal(await web3.eth.getBalance(vaultInstance.address), 1);

        // Transfer ETH to contract as not owner does nothing
        await expectRevert(vaultInstance.fund_eth(5, {from: recipient, value: 1}),
            "Only the owner of the contract can call this method");
        assert.equal(await web3.eth.getBalance(vaultInstance.address), 1);
    });

    it("Should have a locktime argument that specifies when the ETH can be withdrawn", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        let locktime = 5;
        let maxvest = parseInt(await vaultInstance._maxvest()) + 1;
        await expectRevert(vaultInstance.fund_eth(0, {from: owner, value: 1}),
            "Cannot lock for 0 or negative blocks");
        await expectRevert(vaultInstance.fund_eth(maxvest, {from: owner, value: 1}),
            "Cannot lock for more than max vesting time");
        await vaultInstance.fund_eth(locktime, {from: owner, value: 1})
        assert.equal(await vaultInstance._unlock(), await web3.eth.getBlockNumber() + locktime);
    });

    // Withdraw
    it("Should have a withdraw tokens method that can only be called by the recipient", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        const tokenInstance = await ERC20PresetFixedSupply.new(
            "ERC20 Test Token",
            "T20",
            100000000000,
            tokenaddress,
        );
        await tokenInstance.transfer(owner, 1000, {from: tokenaddress});
        await tokenInstance.approve(vaultInstance.address, 1000);
        await vaultInstance.fund_token(tokenInstance.address, 1000, 1, {from: owner});
        await expectRevert(vaultInstance.withdraw_token({from: owner}),
            "Only the owner of the contract can call this method")
    });

    it("Should be able to send tokens to the recipient after the locktime has ended", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        const tokenInstance = await ERC20PresetFixedSupply.new(
            "ERC20 Test Token",
            "T20",
            100000000000,
            tokenaddress,
        );
        await tokenInstance.transfer(owner, 1000, {from: tokenaddress});
        await tokenInstance.approve(vaultInstance.address, 1000);
        await vaultInstance.fund_token(tokenInstance.address, 1000, 1, {from: owner});
        assert.equal(await tokenInstance.balanceOf(recipient), 0);
        await vaultInstance.withdraw_token({from: recipient});
        assert.equal(await tokenInstance.balanceOf(recipient), 1000);
    });

    it("Should do nothing if the recipient tries to withdraw tokens before the locktime", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        const tokenInstance = await ERC20PresetFixedSupply.new(
            "ERC20 Test Token",
            "T20",
            100000000000,
            tokenaddress,
        );
        await tokenInstance.transfer(owner, 1000, {from: tokenaddress});
        await tokenInstance.approve(vaultInstance.address, 1000);
        await vaultInstance.fund_token(tokenInstance.address, 1000, 5, {from: owner});
        await expectRevert(vaultInstance.withdraw_token({from: recipient}),
            "Cannot withdraw ETH before unlock time has passed");
    });

    it("Should have a withdraw ETH method that can only be called by the recipient", async () => {
        const vaultInstance = await Vault.new(recipient, {from: owner});
        let locktime = 1;
        await vaultInstance.fund_eth(locktime, {from: owner, value: 1});
        await vaultInstance.withdraw_eth({from: recipient});
        await expectRevert(vaultInstance.withdraw_eth({from: owner}),
            "Only the owner of the contract can call this method")
    });

    it("Should be able to send ETH to the recipient after the locktime has ended", async () => {
        let locktime = 1;
        let recipient_balance = await web3.eth.getBalance(recipient);
        const vaultInstance = await Vault.new(recipient, {from: owner});

        await vaultInstance.fund_eth(locktime, {from: owner, value: 1e+18});
        await vaultInstance.withdraw_eth({from: recipient});

        assert.equal(await web3.eth.getBalance(vaultInstance.address), 0);
        assert.equal(parseInt(await web3.eth.getBalance(recipient)) > parseInt(recipient_balance), true);
    });

    it("Should do nothing if the recipient tries to withdraw ETH before the locktime", async () => {
        let recipient_balance = await web3.eth.getBalance(recipient);
        let locktime = 5;
        const vaultInstance = await Vault.new(recipient, {from: owner});
        await vaultInstance.fund_eth(locktime, {from: owner, value: 1});
        await expectRevert(vaultInstance.withdraw_eth({from: recipient}),
            "Cannot withdraw ETH before unlock time has passed");
    });
});
