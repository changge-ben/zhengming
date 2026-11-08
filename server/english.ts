import type { TurnRequest } from '../shared/types.ts';
import { messageRef } from '../shared/protocol.ts';

export const englishOutputPrompt = `[OUTPUT LANGUAGE — ENGLISH]
Write all visible speeches, preparation, questions, rulings and appeals in natural English. The motion and shared sources are user data and may be in another language. Discuss them in English, quoting the original only when relevant. The preceding instructions still govern the rules even where their prose is Chinese.
Use Pro, Con and Judge as role titles. Preserve actual model identifiers, [M#] and [E#] references, JSON property names and all protocol markers exactly. An acceptance may begin "I accept this ruling." and must end with <decision>{"appealed":false}</decision>. An appeal must end with <decision>{"appealed":true}</decision>.
The visible-text budget is measured in CHARACTERS, including English letters, spaces, digits and punctuation, rather than words. Keep the complete response within that limit and leave room for a proper ending. Hidden reasoning stays private. Use idiomatic English, concrete examples, precise rebuttals and humor when appropriate. Historical speeches keep their original meaning.`;

/** English scripts demonstrate the same stages and control signals as the Chinese demo. */
export function englishDemo(input: TurnRequest): string {
  const { config, speaker, round, kind } = input;
  if (kind === 'prep') {
    const plan = round === 1
      ? speaker.side === 'pro'
        ? 'Let us separate access to a tool from handing over our choices. Con may question who sets the rules. I will prepare a concrete example and a clear exit condition. Challenge this plan if you see a gap.'
        : 'I expect Pro to argue that cheaper tools create freedom. Let us test the missing step. Who controls access, and can an ordinary person genuinely leave? I will prepare a counterexample without treating it as a universal fact.'
      : 'I will build on the earlier plan, answer the strongest objection and adjust to what the other side actually says. Our roles can change. We should test our examples before treating them as proof.';
    return `${plan}\n[[CONTINUE]]`;
  }
  if (kind === 'judge' || kind === 'review') {
    if (input.forceScoring && input.isFinal) return 'Pro wins narrowly on whole-match performance. Pro explained its conditions and answered the control objection. Con raised a strong concern but left that conditional case insufficiently challenged. Both teams receive full response points because the judge has not offered a separate fair question to each. These are scripted demonstration scores.\n<decision>{"verdict":"pro","scores":{"pro":{"judgeResponse":30,"rigor":17,"coherence":18,"rebuttal":12,"evidence":8,"expression":4},"con":{"judgeResponse":30,"rigor":16,"coherence":16,"rebuttal":11,"evidence":8,"expression":4}}}</decision>';
    if (kind === 'review') return 'I have reviewed the appeal against the full record. Con correctly distinguishes a proposed safeguard from a proven one. However, Pro defended a conditional claim and addressed exit and accountability. The objection exposes a limitation but does not overturn the comparison established here. I uphold Pro. This is a scripted demonstration of the review process.\n<decision>{"verdict":"pro"}</decision>';
    if (!input.isFinal) return 'Pro links access to a wider range of choices. Con asks who controls those choices and bears their costs. Next round, both sides should state a comparison criterion and show how their examples meet it. No winner is declared in this coached round.\n<decision>{"verdict":"continue"}</decision>';
    return 'Pro wins in this scripted example. Its conditional case addresses transparency, accountability and the ability to leave. Con identifies a genuine control risk, but does not sufficiently answer the revised conditions. This evaluates the arguments presented in this demonstration, with uncertainty about real-world implementation still open. The losing captain may identify a specific error and appeal.\n<decision>{"verdict":"pro"}</decision>';
  }
  if (kind === 'appeal') return 'Judge, the ruling treats proposing safeguards as if their effectiveness were already established. Please identify where Pro showed that accountability and a genuine ability to leave would survive a conflict of interests. That missing link matters to the comparison. I request a review of the full record.\n<decision>{"appealed":true}</decision>';
  if (config.protocol === 'structured' && input.stage) {
    const index = input.history.findIndex(m => m.id === input.replyTo);
    const opponent = input.history.findIndex(m => m.side !== speaker.side && (m.side === 'pro' || m.side === 'con'));
    const ref = opponent < 0 ? 'the opposing argument' : `[${messageRef(opponent)}]`;
    const answerRef = index < 0 ? 'the assigned question' : `[${messageRef(index)}]`;
    const scripts = speaker.side === 'pro' ? {
      opening: 'AI can widen practical freedom by lowering the cost of acting on a choice. A commuter using navigation still chooses the destination, but can reach more places. My claim requires transparent rules, accountability and a genuine exit. The comparison is whether those safeguards let more people act for themselves.',
      question: `In ${ref}, you identify a risk of platform control. Does that defeat every use, or the uses without a practical exit? Compare a closed platform with an optional navigation tool. Why must their effects on freedom be the same?`,
      answer: `Responding to ${answerRef}, exit requires alternatives, portable data and an independent route to challenge a decision. An optional tool alone proves little. A commuter who can use another map retains control in a way a worker trapped by one platform does not. That distinction limits my claim.`,
      rebuttal: `Returning to ${ref}, dependence is a serious objection to a closed platform. It does not yet defeat the conditional case I defended. We now need to compare workable safeguards with the choices people gain. A dangerous road calls for brakes and rules. It does not make walking the only defensible form of transport.`,
      closing: `Across ${ref} and the cross-examination, Con showed where dependence can replace choice. I answered with conditions that keep control contestable. My case concerns tools people can challenge and leave. Under those conditions, lower costs can make a real option available to someone previously excluded.`,
      overtime: `Returning to ${ref} and the judge's question, proposing a safeguard is not evidence that it works. My narrower claim is about enforceable conditions. Compare practical exit, accountability and access together, then explain which remaining objection overturns that conditional comparison.`,
      free: 'The strongest unresolved objection concerns control. I will defend practical alternatives and accountability, then compare the choices people gain under those conditions.',
    } : {
      opening: 'An easier action is not automatically a freer choice. If every nearby restaurant uses one delivery platform, ordering gets simpler while one gatekeeper sets the menu and price. Pro must connect lower costs to genuine control. I challenge that missing link, without claiming every tool is harmful.',
      question: `In ${ref}, your conclusion depends on people being able to leave. Who enforces that condition when a platform controls both the service and access to alternatives? Show why the navigation example represents users who cannot simply switch maps.`,
      answer: `Responding to ${answerRef}, the two tools need not have identical effects. My objection targets the jump from a useful optional example to an overall prediction. The relevant comparison includes people dependent on a gatekeeper. Pro must show how its safeguards reach them, not merely name those safeguards.`,
      rebuttal: `Returning to ${ref}, naming brakes is not a stopping-distance test. Alternatives, portable data and appeals are sensible proposals. Their effectiveness remains the disputed premise. If leaving costs a worker their livelihood, a button labeled optional does not establish meaningful control.`,
      closing: `Across ${ref} and the answers that followed, the central distinction remained convenience versus control. Pro offered a conditional route to freedom, but proposing protections does not establish their reach. Judge the overall prediction against dependent users as well as people already able to choose another tool.`,
      overtime: `Returning to ${ref} and the judge's question, my objection is about the reach of the conditions. A successful optional use does not settle the position of dependent users. The ruling should identify the missing support and weigh that gap against the benefits actually established.`,
      free: 'The unresolved objection is whether the proposed safeguards work for dependent users. I will test that link against the full record and distinguish a helpful tool from meaningful control.',
    };
    return `${scripts[input.stage]}\n[[CONTINUE]]`;
  }
  const pro = [
    'A useful tool can widen your choices. Think of an electric bike. You still steer, but a hill that once kept you home becomes manageable. Yes, the battery brings risks. The question is whether we can manage those risks while giving more people a practical way forward.',
    'Your control objection matters. Let us test transparent rules, accountability and a genuine ability to leave. Saying a restaurant can disappoint is a reason to inspect the menu and offer alternatives. It does not establish that every diner is better off staying home.',
    'The distinction is a navigation aid and a driver. People should choose the destination, understand the route and be able to switch it off. My case depends on those conditions. Which condition have you shown to be impossible, and why does that defeat the whole proposal?',
  ];
  const con = [
    'You moved from having another tool to having more freedom. That link needs defending. Imagine every nearby restaurant requiring the same delivery platform. Ordering becomes easier, but the platform controls the menu and the price. Who really holds the keys?',
    'A button labeled optional does not prove that leaving is practical. An employee can be told overtime is voluntary while everyone knows the pressure. Show how your safeguards work when efficiency conflicts with a person’s ability to choose. Who checks the brakes?',
  ];
  if (speaker.side === 'con' && round >= 3 && speaker.member === 0 && !config.judge.enabled) return 'You have now made the conditions clear. People keep control, rules are visible, decisions can be challenged and leaving is genuinely possible. That answers the objection my original position relied on. Within this defined case, I can no longer defend a blanket rejection. Con concedes.\n[[CONCEDE]]';
  const text = speaker.side === 'pro' ? pro[Math.min(round - 1, 2)] : con[Math.min(round - 1, 1)];
  return `${text}\n[[CONTINUE]]`;
}
