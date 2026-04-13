require("dotenv/config");
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const reviewerWallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);

  console.log("Agent (owner):", agentWallet.address);
  console.log("Reviewer:", reviewerWallet.address);

  const agentId = 338;
  const indexLimit = 1000n;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const chainId = 84532n;
  const identityRegistryAddr = process.env.IDENTITY_REGISTRY;
  const signerAddress = agentWallet.address;

  // Step 1: ABI-encode the struct (7 × 32 bytes = 224 bytes)
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const structEncoded = coder.encode(
    ["uint256", "address", "uint64", "uint256", "uint256", "address", "address"],
    [agentId, reviewerWallet.address, indexLimit, expiry, chainId, identityRegistryAddr, signerAddress]
  );
  console.log("Struct length:", (structEncoded.length - 2) / 2, "bytes");

  // Step 2: Hash the struct
  const structHash = ethers.keccak256(structEncoded);
  console.log("Struct hash:", structHash);

  // Step 3: Sign (signMessage auto-adds EIP-191 prefix)
  const signature = await agentWallet.signMessage(ethers.getBytes(structHash));
  const sigBytes = ethers.getBytes(signature);
  console.log("Signature length:", sigBytes.length, "bytes");

  // Step 4: Concat struct + signature
  const structBytes = ethers.getBytes(structEncoded);
  const authBytes = new Uint8Array(structBytes.length + sigBytes.length);
  authBytes.set(structBytes, 0);
  authBytes.set(sigBytes, structBytes.length);
  const feedbackAuth = ethers.hexlify(authBytes);
  console.log("feedbackAuth total length:", (feedbackAuth.length - 2) / 2, "bytes (expect 289)");

  // Now try
  const repAbi = [
    "function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string fileuri, bytes32 filehash, bytes feedbackAuth) external",
  ];
  const rep = new ethers.Contract(process.env.REPUTATION_REGISTRY, repAbi, reviewerWallet);
  
  const tag1 = ethers.encodeBytes32String("tradingYield");
  const tag2 = ethers.encodeBytes32String("day");

  try {
    const gas = await rep.giveFeedback.estimateGas(
      agentId, 75, tag1, tag2, "", ethers.ZeroHash, feedbackAuth
    );
    console.log("\nGas estimate:", gas.toString());
    
    console.log("Sending transaction...");
    const tx = await rep.giveFeedback(agentId, 75, tag1, tag2, "", ethers.ZeroHash, feedbackAuth);
    const receipt = await tx.wait();
    console.log("TX CONFIRMED:", receipt.hash);
    console.log("SUCCESS — reputation feedback posted on-chain!");
  } catch (e) {
    console.log("\nFailed:", e.shortMessage || e.message.slice(0, 500));
  }
}
main().catch(e => console.error(e));
