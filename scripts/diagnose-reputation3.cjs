require("dotenv/config");
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const repAddr = process.env.REPUTATION_REGISTRY;
  const validatorWallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);

  // Check if our selector exists in bytecode  
  const code = await provider.getCode(repAddr);
  const selector = "3c036a7e"; // giveFeedback
  console.log("giveFeedback selector in bytecode?", code.includes(selector));

  // List all 4-byte selectors in the bytecode (PUSH4 = 0x63)
  const selectors = new Set();
  for (let i = 0; i < code.length - 10; i += 2) {
    if (code.slice(i, i+2) === "63") {
      selectors.add("0x" + code.slice(i+2, i+10));
    }
  }
  console.log("Found selectors:", [...selectors].sort().join(", "));

  // Try static call for giveFeedback to get revert data
  const iface = new ethers.Interface([
    "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  ]);
  const calldata = iface.encodeFunctionData("giveFeedback", [
    338, 85, 0, "starred", "", "", "", ethers.ZeroHash
  ]);
  console.log("\ngiveFeedback calldata:", calldata.slice(0, 74) + "...");

  try {
    const result = await provider.call({ 
      to: repAddr, 
      data: calldata,
      from: validatorWallet.address 
    });
    console.log("Static call result:", result);
  } catch(e) {
    console.log("Static call error code:", e.code);
    console.log("Static call error data:", e.data);
    console.log("Static call revert reason:", e.reason);
    console.log("Static call info:", JSON.stringify(e.info?.error || {}).slice(0, 500));
  }

  // Check if maybe we need to use the Identity Registry address 
  // as a required param reference
  const valAddr = process.env.VALIDATION_REGISTRY;
  const idAddr = process.env.IDENTITY_REGISTRY;
  console.log("\nValidation Registry:", valAddr);
  console.log("Identity Registry:", idAddr);
  
  // Check the validation registry - does submitValidationRequest work?
  const valAbi = [
    "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external",
    "function getAgentValidations(uint256 agentId) external view returns (bytes32[])",
  ];
  const valContract = new ethers.Contract(valAddr, valAbi, provider);
  try {
    const validations = await valContract.getAgentValidations(338);
    console.log("Agent 338 validations count:", validations.length);
    if (validations.length > 0) {
      console.log("First hash:", validations[0]);
      console.log("Last hash:", validations[validations.length - 1]);
    }
  } catch(e) { console.log("getAgentValidations error:", e.message.slice(0,200)); }

  // Check feedbackAuth-like patterns - try reading storage slots
  for (let slot = 0; slot < 10; slot++) {
    const val = await provider.getStorage(repAddr, slot);
    if (val !== ethers.ZeroHash) {
      console.log(`Storage slot ${slot}:`, val);
    }
  }
}
main().catch(e => console.error(e));
