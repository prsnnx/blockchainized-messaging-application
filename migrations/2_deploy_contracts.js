const ChatApp = artifacts.require("MApp");

module.exports = function(deployer) {
  deployer.deploy(ChatApp);
};
