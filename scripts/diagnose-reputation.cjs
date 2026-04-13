require("dotenv/config");
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  
  const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const validatorWallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  
  console.log("Agent wallet:", agentWallet.address);
  console.log("Reviewer wallet:", validatorWallet.address);
  console.log("Same?", agentWallet.address.toLowerCase() === validatorWallet.address.toLowerCase());

  const idAbi = ["function ownerOf(uint256 tokenId) external view returns (address)"];
  const identity = new ethers.Contract(process.env.IDENTITY_REGISTRY, idAbi, provider);
  const owner = await identity.ownerOf(338);
  console.log("Agent 338 NFT owner:", owner);
  console.log("Owner === Agent wallet?", owner.toLowerCase() === agentWallet.address.toLowerCase());
  console.log("Owner === Reviewer?", owner.toLowerCase() === validatorWallet.address.toLowerCase());
  
  const repAbi = [
    "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  ];

  // Try from agent wallet
  const repFromAgent = new ethers.Contract(process.env.REPUTATION_REGISTRY, repAbi, agentWallet);
  try {
    const gas = await repFromAgent.giveFeedback.estimateGas(338, 85, 0, "starred", "", "", "", ethers.ZeroHash);
    console.log("giveFeedback from AGENT wallet gas:", gas.toString());
  } catch(e) { console.log("giveFeedback from AGENT reverts:", e.shortMessage || e.message.slice(0,300)); }

  // Try from validator wallet for agentId=1
  const repFromVal = new ethers.Contract(process.env.REPUTATION_REGISTRY, repAbi, validatorWallet);
  try {
    const gas = await repFromVal.giveFeedback.estimateGas(1, 85, 0, "starred", "", "", "", ethers.ZeroHash);
    console.log("giveFeedback for agentId=1 gas:", gas.toString());
  } catch(e) { console.log("giveFeedback for agentId=1 reverts:", e.shortMessage || e.message.slice(0,300)); }

  // Try from validator for agent 338
  try {
    const gas = await repFromVal.giveFeedback.estimateGas(338, 85, 0, "starred", "", "", "", ethers.ZeroHash);
    console.log("giveFeedback from VAL for 338 gas:", gas.toString());
  } catch(e) { console.log("giveFeedback from VAL for 338 reverts:", e.shortMessage || e.message.slice(0,300)); }

  // Check if there's a feedbackAuth contract
  const repCheckAbi = [
    "function feedbackAuth() external view returns (address)",
    "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  ];
  const repCheck = new ethers.Contract(process.env.REPUTATION_REGISTRY, repCheckAbi, provider);
  try {
    const authAddr = await repCheck.feedbackAuth();
    console.log("feedbackAuth address:", authAddr);
  } catch(e) { console.log("feedbackAuth not available (v1.0 removed it):", e.message.slice(0,100)); }
}
main().catch(e => console.error(e));
