require("dotenv/config");
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const repAddr = process.env.REPUTATION_REGISTRY;
  console.log("Reputation Registry:", repAddr);

  // Check if contract exists
  const code = await provider.getCode(repAddr);
  console.log("Bytecode length:", code.length, "chars (0x included)");
  console.log("Has code?", code !== "0x");

  // Try raw call to getClients(338) to see what data comes back
  const iface = new ethers.Interface([
    "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
    "function getClients(uint256 agentId) external view returns (address[])",
  ]);

  // Check function selectors
  console.log("giveFeedback selector:", iface.getFunction("giveFeedback").selector);
  console.log("getClients selector:", iface.getFunction("getClients").selector);

  // Try raw eth_call for getClients
  const calldata = iface.encodeFunctionData("getClients", [338]);
  try {
    const result = await provider.call({ to: repAddr, data: calldata });
    console.log("getClients raw result:", result);
  } catch(e) { console.log("getClients raw error:", e.message.slice(0,200)); }

  // Try checking if it's maybe a proxy - look for implementation slot
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implRaw = await provider.getStorage(repAddr, implSlot);
  console.log("EIP-1967 impl slot:", implRaw);
  if (implRaw !== ethers.ZeroHash) {
    const implAddr = "0x" + implRaw.slice(26);
    console.log("Implementation address:", implAddr);
    const implCode = await provider.getCode(implAddr);
    console.log("Impl bytecode length:", implCode.length);
  }

  // Check if there's a different ABI — maybe it's the old v0.4 with uint8 score
  const oldAbi = [
    "function giveFeedback(uint256 agentId, uint8 score, string tag, string feedbackURI, bytes32 feedbackHash) external",
  ];
  const oldIface = new ethers.Interface(oldAbi);
  console.log("Old giveFeedback selector:", oldIface.getFunction("giveFeedback").selector);

  // Try with old ABI
  const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const oldRep = new ethers.Contract(repAddr, oldAbi, agentWallet);
  try {
    const gas = await oldRep.giveFeedback.estimateGas(338, 85, "starred", "", ethers.ZeroHash);
    console.log("Old ABI giveFeedback gas:", gas.toString());
  } catch(e) { console.log("Old ABI giveFeedback reverts:", e.shortMessage || e.message.slice(0,200)); }

  // Try checking all 4-byte selectors via raw call
  // List common Reputation-like functions
  const testSelectors = [
    { sig: "function initialize(address)", name: "initialize" },
    { sig: "function owner() view returns (address)", name: "owner" },
    { sig: "function paused() view returns (bool)", name: "paused" },
    { sig: "function name() view returns (string)", name: "name" },
  ];
  for (const { sig, name } of testSelectors) {
    const ifc = new ethers.Interface([sig]);
    const data = ifc.encodeFunctionData(name, name === "initialize" ? [agentWallet.address] : []);
    try {
      const result = await provider.call({ to: repAddr, data });
      const decoded = ifc.decodeFunctionResult(name, result);
      console.log(`${name}():`, decoded[0]);
    } catch(e) { console.log(`${name}(): reverts`); }
  }
}
main().catch(e => console.error(e));
