const { ethers } = require("ethers");
require("dotenv").config();

const REP_ABI = [
  "function submitFeedback(uint256 agentId, uint8 score, bytes32 outcomeRef, string comment, uint8 feedbackType) external",
  "function getAverageScore(uint256 agentId) external view returns (uint256)",
];

const RPCS = [
  "https://sepolia.drpc.org",
  "https://rpc2.sepolia.org",
  "https://1rpc.io/sepolia",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

const AGENT_ID = 18;
const SCORE = 100;
const TARGET_REP = 100;
const FUND_AMOUNT = ethers.parseEther("0.002"); // enough for gas
const MAX_POSTS = 500;
const ERROR_LIMIT = 50;

let rpcIdx = 0;
function getProvider() {
  return new ethers.JsonRpcProvider(RPCS[rpcIdx], { chainId: 11155111, name: "sepolia" }, { staticNetwork: true });
}

function rotateRpc() {
  rpcIdx = (rpcIdx + 1) % RPCS.length;
  console.log("  RPC -> " + RPCS[rpcIdx]);
}

async function main() {
  let provider = getProvider();
  let mainWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Check initial score
  const readReg = new ethers.Contract(process.env.REPUTATION_REGISTRY, REP_ABI, provider);
  const initScore = await readReg.getAverageScore(AGENT_ID);
  console.log("START: rep=" + initScore + ", rpc=" + RPCS[rpcIdx]);

  if (Number(initScore) >= TARGET_REP) {
    console.log("Already at target!");
    return;
  }

  let sent = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  let mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");

  for (let i = 0; i < MAX_POSTS; i++) {
    try {
      // Create ephemeral reviewer
      const reviewer = ethers.Wallet.createRandom().connect(provider);

      // Fund the reviewer
      const feeData = await provider.getFeeData();
      const fundTx = await mainWallet.sendTransaction({
        to: reviewer.address,
        value: FUND_AMOUNT,
        nonce: mainNonce,
        maxFeePerGas: (feeData.maxFeePerGas ?? feeData.gasPrice) * 3n,
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 100000000n) * 3n,
        gasLimit: 21000,
      });
      await fundTx.wait(1);
      mainNonce++;

      // Submit feedback from reviewer
      const reg = new ethers.Contract(process.env.REPUTATION_REGISTRY, REP_ABI, reviewer);
      const outcomeRef = ethers.keccak256(ethers.toUtf8Bytes(`boost-${AGENT_ID}-${Date.now()}-${i}`));

      const reviewerFee = await provider.getFeeData();
      const tx = await reg.submitFeedback(AGENT_ID, SCORE, outcomeRef, "Excellent agent", 1, {
        maxFeePerGas: (reviewerFee.maxFeePerGas ?? reviewerFee.gasPrice) * 3n,
        maxPriorityFeePerGas: (reviewerFee.maxPriorityFeePerGas ?? 100000000n) * 3n,
        gasLimit: 200000,
      });
      await tx.wait(1);

      sent++;
      consecutiveErrors = 0;

      if (sent % 10 === 0) {
        // Check score
        const pCheck = getProvider();
        const cCheck = new ethers.Contract(process.env.REPUTATION_REGISTRY, REP_ABI, pCheck);
        const score = await cCheck.getAverageScore(AGENT_ID);
        console.log(">>> rep=" + score + " sent=" + sent);
        if (Number(score) >= TARGET_REP) {
          console.log("*** TARGET " + TARGET_REP + " REACHED! ***");
          return;
        }
      } else {
        process.stdout.write("  sent=" + sent + " err=" + errors + " nonce=" + mainNonce + "  \r");
      }
    } catch (e) {
      errors++;
      consecutiveErrors++;
      const msg = e.message || "";
      console.log("  ERR[" + errors + "/" + consecutiveErrors + "]: " + msg.slice(0, 120));

      if (msg.includes("nonce")) {
        // Refresh nonce
        try {
          const pRefresh = getProvider();
          mainWallet = new ethers.Wallet(process.env.PRIVATE_KEY, pRefresh);
          provider = pRefresh;
          mainNonce = await pRefresh.getTransactionCount(mainWallet.address, "pending");
          console.log("  nonce refreshed to " + mainNonce);
        } catch (_) {}
      }

      if (consecutiveErrors >= 5) {
        rotateRpc();
        provider = getProvider();
        mainWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        consecutiveErrors = 0;
        try {
          mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");
        } catch (_) {}
      }

      if (errors >= ERROR_LIMIT) {
        console.log("ERROR LIMIT REACHED");
        break;
      }
    }
  }

  // Final check
  const pFinal = getProvider();
  const cFinal = new ethers.Contract(process.env.REPUTATION_REGISTRY, REP_ABI, pFinal);
  const finalScore = await cFinal.getAverageScore(AGENT_ID);
  console.log("DONE: rep=" + finalScore + " sent=" + sent + " errors=" + errors);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
