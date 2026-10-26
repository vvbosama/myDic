import type { AiExplanation, AiSuggestion } from '@/types';

const explanations: Record<string, AiExplanation> = {
  significant: { summary: '核心感觉是“达到不可忽视、值得注意的程度”，既可以描述数量，也可以描述重要性。', usage: '正式程度比 important 更高，常用于学术、商业和新闻语境。', memoryTip: '把它和 significant impact、significant increase 一起记。' },
  mitigate: { summary: '重点是让已经存在的问题变得不那么严重，而不是把问题彻底消除。', usage: '常和 risk、impact、damage、problem 搭配。', memoryTip: '可以把它理解成“把负面影响的音量调低”。' }
};

export async function explainExpression(expression: string): Promise<AiExplanation> {
  await new Promise((resolve) => setTimeout(resolve, 380));
  return explanations[expression.toLocaleLowerCase()] ?? { summary: `可以把“${expression}”放回具体语境中理解，先抓住它在句子里承担的动作或特征。`, usage: '建议结合词典例句和自己的例句一起记忆。', memoryTip: '把表达和一个真实场景、一个常见搭配绑定起来。' };
}

export async function suggestRelations(expression: string): Promise<AiSuggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 420));
  if (expression.toLocaleLowerCase() === 'mitigate') return [
    { expression: 'alleviate', relation: 'Synonym', reason: '都可以表示减轻问题或负担。' },
    { expression: 'reduce', relation: 'Contrast', reason: '语义接近，但 mitigate 更强调降低负面影响。' },
    { expression: 'mitigate the risk', relation: 'Extension', reason: '这是写作和正式表达中很常见的搭配。' }
  ];
  return [
    { expression: 'substantial', relation: 'Related', reason: '在正式表达中经常出现在相近语境。' },
    { expression: `${expression} impact`, relation: 'Extension', reason: '可以尝试把表达放入一个常见搭配中。' }
  ];
}

export async function compareExpressions(left: string, right: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 420));
  return `${left} 和 ${right} 都可以在相近语境中使用，但具体差异需要结合搭配和语气判断。建议分别记录一个最典型的例句，再比较它们能否互换。`;
}
