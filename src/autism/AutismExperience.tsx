import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, AudioLines, Check, ChevronDown, HeartHandshake, Info, Menu, Pause, Play, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import "./autism.css";

type Story = { name: string; role: string; title: string; text: string; note: string };
type Quiz = { question: string; options: string[]; answer: number; explanation: string };

const stories: Story[] = [
  { name: "毛宇", role: "医生妈妈", title: "确诊之后的自责", text: "孩子两岁多确诊孤独症。刻板动作、不爱说话，常常沉浸在自己的世界。带孩子参加生日宴时，孩子重复刻板动作，之后我们很少参加这类社交活动。确诊，只是漫长旅程的开始。", note: "从专业工作者到孩子的母亲，身份的变化并没有让确诊变得容易。" },
  { name: "毛宇", role: "家长口述", title: "关于阳光宝宝卡的病耻感", text: "上海有面向符合条件儿童的康复补贴项目，但有些家长因为难以接受残障身份、害怕旁人的眼光，而迟迟不愿申请，宁愿自己承担康复开销。", note: "补贴不仅是经济支持，也意味着家庭能否安心地寻求帮助。" },
  { name: "敖艳秋", role: "母亲", title: "辞职后的全职照护", text: "孩子一岁十个月确诊重度孤独症并伴随智力障碍。我辞去工作全职陪护。把他放进海洋球池，别的孩子很开心，他却会发抖、哭泣。家庭生活几乎偏离了原本的全部预想。", note: "照护是一项持续的劳动，也会改变家庭成员的工作、关系与生活安排。" },
  { name: "李梦颖", role: "家长", title: "撕掉天才滤镜", text: "孤独症孩子并不都是天才，只有极少数人拥有绘画、音乐等特殊特长。大部分孩子就是普通孩子。孩子独自坐地铁，刻板动作却可能招来旁人的异样目光。他们需要的是理解，而不是被神化。", note: "把孩子从“天才”或“奇特”的标签里放出来，才能看见真实的个体。" },
  { name: "毛宇", role: "家长口述", title: "父母老去之后", text: "康复的路很漫长。我们最大的担忧是：如果有一天我们老去、离开，孩子该如何有尊严地生活下去？", note: "家庭真正需要的，不只是短期干预，还有教育、就业、社区与长期照护支持。" },
];

const quiz: Quiz[] = [
  { question: "孤独症孩子大多是绘画、音乐方面的天才？", options: ["是，孤独症通常伴随特殊天赋", "不是，特殊才能只出现在少数人身上"], answer: 1, explanation: "孤独症谱系内部差异很大。少数人有某些突出能力，但绝大多数孩子并不是所谓的“天才”，而是有各自优势、困难和支持需求的普通个体。" },
  { question: "产检结果正常，就能排除孩子未来是孤独症吗？", options: ["能，常规产检可以筛查孤独症", "不能，常规产检不能排除孤独症"], answer: 1, explanation: "常规产前筛查并不是孤独症筛查或诊断工具。产检正常不代表能够排除孩子日后出现神经发育差异；如有家族遗传方面的担忧，应向专业医生咨询。" },
  { question: "孩子在公共场所捂耳朵、哭闹，通常说明他调皮、没教养？", options: ["是，应该立刻制止", "不一定，可能正在经历感官过载或其他不适"], answer: 1, explanation: "声音、光线、拥挤、疼痛或沟通受阻，都可能让孩子难以承受。先降低刺激、留出空间并尊重孩子的表达，比责备更有帮助。" },
  { question: "通过后天训练，就能保证孤独症完全“治好”？", options: ["能，只要训练足够多", "不能保证；支持与干预应以个体需要和生活质量为目标"], answer: 1, explanation: "孤独症是神经发育差异。科学、适合个体的支持可能帮助提升沟通、学习、生活适应和参与能力，但不应承诺统一的“治愈”结果，也不应以课时多少替代专业评估。" },
  { question: "已经有一个孤独症孩子，第二个孩子一定也会是孤独症吗？", options: ["一定会", "不一定；风险评估需要结合家庭情况和专业遗传咨询"], answer: 1, explanation: "再次生育的风险可能高于一般人群，但并非必然。遗传因素复杂，不能简单归结为某一种基因变化；有相关计划时可咨询临床遗传或产前诊断专业人员。" },
];

const facts = [
  { value: "7‰", label: "儿童孤独症患病率", detail: "国家卫生健康委公开文件引用的我国儿童孤独症患病率约为 7‰，约每 1,000 名儿童中有 7 名。不同研究的年龄范围、样本与诊断方法不同，数字可能存在差异。", source: "国家卫生健康委《0～6岁儿童孤独症筛查干预服务规范（试行）》", href: "https://www.nhc.gov.cn/wjw/c100376/202209/6a80e32ecd4a41a1907966e70a080688.shtml" },
  { value: "长期", label: "家庭照护与康复支持", detail: "康复、教育、医疗、交通与照护安排可能形成长期支出。具体费用因地区、服务方式、家庭需求和救助政策而异，不宜用单一“年均费用”概括所有家庭。", source: "家庭口述与公开报道整理；具体数字待进一步核验", href: "" },
  { value: "协同", label: "融合教育与社区支持", detail: "孩子的成长需要家庭、医疗康复、学校和社区之间的衔接。融合教育不只是进入普通学校，还需要合理的个别化支持、教师协作与持续评估。", source: "国家卫生健康委筛查干预服务规范；地方实践案例待核实", href: "https://www.nhc.gov.cn/wjw/c100376/202209/6a80e32ecd4a41a1907966e70a080688.shtml" },
];

const cases = [
  { title: "海宁：医康教衔接", body: "探索康复、托育、特殊教育与社区服务之间的衔接，让儿童在不同成长阶段获得连续支持。", status: "地方实践案例 · 发布前补充官方来源" },
  { title: "上海：双导师与融合支持", body: "虹口区“双导师制”、徐汇“彩虹桥”等实践，尝试加强学校支持与家庭协作。", status: "地方实践案例 · 项目名称及现行情况待核实" },
  { title: "家庭喘息服务", body: "“星妈港湾”等家长支持项目，让照护者获得交流、休息和寻找资源的空间。", status: "服务项目 · 以当地妇联/残联最新信息为准" },
];

function makeNoise(context: AudioContext, seconds = 2) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.18;
  return buffer;
}

export default function AutismExperience() {
  const [soundOn, setSoundOn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(38);
  const [activeStory, setActiveStory] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [expandedCase, setExpandedCase] = useState<number | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopAudio = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    sourcesRef.current.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } });
    sourcesRef.current = [];
    const context = audioRef.current;
    audioRef.current = null;
    masterRef.current = null;
    if (context && context.state !== "closed") void context.close();
    setSoundOn(false);
  };

  const startAudio = async () => {
    if (soundOn) { stopAudio(); return; }
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    audioRef.current = context;
    await context.resume();
    const master = context.createGain();
    master.gain.value = muted ? 0 : (volume / 100) * 0.12;
    master.connect(context.destination);
    masterRef.current = master;

    const noise = context.createBufferSource();
    noise.buffer = makeNoise(context);
    noise.loop = true;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 520;
    const crowd = context.createGain();
    crowd.gain.value = 0.55;
    noise.connect(lowpass).connect(crowd).connect(master);
    noise.start();
    sourcesRef.current.push(noise);

    const hum = context.createOscillator();
    const humGain = context.createGain();
    hum.type = "sine";
    hum.frequency.value = 68;
    humGain.gain.value = 0.12;
    hum.connect(humGain).connect(master);
    hum.start();
    sourcesRef.current.push(hum);

    const horn = context.createOscillator();
    const hornGain = context.createGain();
    horn.type = "triangle";
    horn.frequency.value = 190;
    hornGain.gain.value = 0.025;
    horn.connect(hornGain).connect(master);
    horn.start();
    sourcesRef.current.push(horn);

    const pulse = () => {
      if (!audioRef.current || audioRef.current !== context) return;
      const now = context.currentTime;
      const clink = context.createOscillator();
      const envelope = context.createGain();
      clink.type = "sine";
      clink.frequency.setValueAtTime(980 + Math.random() * 220, now);
      clink.frequency.exponentialRampToValueAtTime(520, now + 0.12);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.035, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      clink.connect(envelope).connect(master);
      clink.start(now);
      clink.stop(now + 0.2);
    };
    timerRef.current = window.setInterval(pulse, 1850);
    setSoundOn(true);
  };

  useEffect(() => {
    if (masterRef.current) {
      masterRef.current.gain.setTargetAtTime(muted ? 0 : (volume / 100) * 0.12, audioRef.current?.currentTime ?? 0, 0.08);
    }
  }, [muted, volume]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    sourcesRef.current.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } });
    if (audioRef.current && audioRef.current.state !== "closed") void audioRef.current.close();
  }, []);

  const answeredCount = Object.keys(answers).length;
  const nextStory = () => setActiveStory((n) => (n + 1) % stories.length);
  const previousStory = () => setActiveStory((n) => (n - 1 + stories.length) % stories.length);

  return (
    <main className={\`autism-site \${soundOn && !muted ? "sound-active" : ""}\`}>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="星星的孩子首页"><span className="brand-star">✳</span><span>星星的孩子<small>UNDER THE SAME SKY</small></span></a>
        <button className="menu-toggle" aria-label="打开导航" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={20} /></button>
        <nav className={mobileMenu ? "nav-open" : ""}>
          <a href="#sense" onClick={() => setMobileMenu(false)}>感官体验</a><a href="#families" onClick={() => setMobileMenu(false)}>家庭故事</a><a href="#facts" onClick={() => setMobileMenu(false)}>现实数据</a><a href="#quiz" onClick={() => setMobileMenu(false)}>科普测试</a><a href="#action" onClick={() => setMobileMenu(false)}>行动指南</a>
        </nav>
        <button className="global-mute" onClick={() => setMuted((v) => !v)} aria-pressed={muted}><span className="mute-icon">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</span>{muted ? "全局静音" : "声音已开启"}</button>
      </header>

      <section className="hero" id="home">
        <div className="hero-stars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <div className="hero-copy">
          <p className="eyebrow">WORLD AUTISM AWARENESS DAY · 02 APR</p>
          <h1>星星的孩子<br /><em>走进孤独症的世界</em></h1>
          <p className="hero-lead">世界孤独症日，我们常常看见孩子，却常常忽略他们背后的家庭。</p>
          <p className="hero-desc">孤独症不是“天才病”。他们只是感知、理解和回应世界的方式有所不同。向下探索，感受感官差异，聆听家庭真实的心声。</p>
          <a className="primary-link" href="#sense">开启体验旅程 <ArrowDown size={16} /></a>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="moon" /><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="star-child">✳</div><span className="orbit-caption">A DIFFERENT WAY<br />OF EXPERIENCING</span></div>
        <div className="hero-bottom"><span>理解始于倾听</span><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="section sense-section" id="sense">
        <div className="section-kicker">01 / SENSORY EXPERIENCE</div>
        <div className="section-heading"><div><p className="eyebrow">听觉模拟</p><h2>当声音，<br />不再只是背景。</h2></div><p className="section-intro">对部分孤独症人士来说，日常环境里的声音可能难以过滤、难以忽略。普通人习以为常的背景噪音，也可能变得刺耳、拥挤，让人难以集中注意。</p></div>
        <div className="sound-panel">
          <div className="sound-topline"><span><AudioLines size={17} /> 听觉感官体验</span><span className="sound-status">{soundOn && !muted ? "模拟进行中" : "环境安静"}</span></div>
          <div className="sound-scene">
            <div className="sound-orbit orbit-a" /><div className="sound-orbit orbit-b" /><div className="sound-core"><span>{soundOn && !muted ? "声音叠加中" : "安静的环境"}</span><small>{soundOn && !muted ? "多种声音同时出现" : "准备好后再开启"}</small></div>
            <div className="sound-label label-crowd">人群交谈</div><div className="sound-label label-dish">餐具碰撞</div><div className="sound-label label-hum">持续嗡鸣</div><div className="sound-label label-horn">远处喇叭</div>
          </div>
          <div className="sound-controls">
            <button className="sound-start" onClick={() => void startAudio()}>{soundOn ? <Pause size={17} /> : <Play size={17} />}{soundOn ? "暂停模拟" : "开启听觉模拟"}</button>
            <button className="noise-cut" onClick={stopAudio}><VolumeX size={17} /> 降噪 · 恢复安静</button>
            <label className="volume-control"><span>模拟音量</span><input type="range" min="0" max="60" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /><b>{volume}%</b></label>
          </div>
          <div className="sound-warning"><ShieldAlert size={18} /><p><strong>体验提示</strong> 本模拟包含多层合成环境声，音量经过限制。听力敏感人群建议谨慎体验；可随时点击“降噪”或“全局静音”。请勿在高音量下使用耳机。</p></div>
        </div>
        <p className="section-note"><Info size={15} /> 这只是简化的声音叠加示意，不代表所有孤独症人士的感受。现实中，孩子可能捂住耳朵、哭泣、离开现场或以其他方式表达不适。这不是“不听话”，而可能是感官负荷过高。请先减少刺激、给予空间。</p>
      </section>

      <section className="section family-section" id="families">
        <div className="section-kicker">02 / FAMILY VOICES</div>
        <div className="section-heading"><div><p className="eyebrow">家庭故事</p><h2>孩子之外，<br />还有一个家庭。</h2></div><p className="section-intro">诊断只是旅程的起点。长期照护、康复安排、教育衔接与社会目光，都可能落在家庭成员身上。让我们听听他们如何讲述自己的生活。</p></div>
        <div className="story-carousel">
          <div className="story-counter"><span>0{activeStory + 1}</span><i />0{stories.length}</div>
          <article className="story-card" key={activeStory}>
            <div className="story-card-top"><span>家长口述 · {stories[activeStory].role}</span><span>FAMILY VOICE</span></div>
            <div className="story-quote-mark">“</div>
            <h3>{stories[activeStory].title}</h3>
            <blockquote>{stories[activeStory].text}</blockquote>
            <p className="story-note">{stories[activeStory].note}</p>
            <div className="story-card-bottom"><strong>{stories[activeStory].name}</strong><span>素材来源：澎湃新闻（原文待核对）</span></div>
          </article>
          <div className="story-controls"><button onClick={previousStory} aria-label="上一则故事"><ArrowLeft size={18} /></button><div className="story-dots">{stories.map((s, i) => <button key={s.title} aria-label={\`第\${i + 1}则故事\`} aria-current={activeStory === i} onClick={() => setActiveStory(i)} />)}</div><button onClick={nextStory} aria-label="下一则故事"><ArrowRight size={18} /></button></div>
          <p className="source-disclaimer">说明：本页文字依据你提供的家长口述素材整理，并非已完成逐字引文核验。正式公开发布前，请补充澎湃新闻原文链接、核对姓名与引文，并确认转载/摘录授权。</p>
        </div>
      </section>

      <section className="section facts-section" id="facts">
        <div className="section-kicker">03 / FACTS & CONTEXT</div>
        <div className="section-heading"><div><p className="eyebrow">现实数据看板</p><h2>数字背后，<br />是一个个真实家庭。</h2></div><p className="section-intro">数据帮助我们看见群体规模，但无法替代每个孩子、每个家庭的具体经历。阅读数字时，也请留意统计口径与数据来源。</p></div>
        <div className="fact-grid">{facts.map((fact, i) => <article className="fact-card" key={fact.label}><span className="fact-index">0{i + 1}</span><strong className="fact-value">{fact.value}</strong><h3>{fact.label}</h3><p>{fact.detail}</p><span className="fact-source">{fact.href ? <a href={fact.href} target="_blank" rel="noreferrer">{fact.source} ↗</a> : fact.source}</span></article>)}</div>
        <div className="fact-callout"><div><span className="eyebrow">关于产前筛查</span><h3>产检正常，<br />不等于能排除孤独症。</h3></div><p>目前常规产前筛查并不是孤独症筛查或诊断工具。孤独症涉及复杂的神经发育与遗传因素，不能用单一孕期检查作出保证。若有家族遗传方面的担忧，应向临床遗传或产前诊断专业人员咨询。</p></div>
        <div className="case-area"><div className="case-heading"><div><p className="eyebrow">SUPPORT IN PRACTICE</p><h3>让支持真正发生</h3></div><span>点击卡片了解实践方向</span></div><div className="case-grid">{cases.map((item, i) => <button className={expandedCase === i ? "case-card expanded" : "case-card"} key={item.title} onClick={() => setExpandedCase(expandedCase === i ? null : i)} aria-expanded={expandedCase === i}><span>0{i + 1}</span><strong>{item.title}</strong><ChevronDown size={17} />{expandedCase === i && <p>{item.body}<small>{item.status}</small></p>}</button>)}</div></div>
        <p className="section-note"><Info size={15} /> 康复频率、服务方式和教育安排应根据儿童特点、家庭目标及专业评估制定，不存在适用于所有孩子的统一课时标准。家庭支出也因地区和服务资源而异。</p>
      </section>

      <section className="section quiz-section" id="quiz">
        <div className="section-kicker">04 / MYTH BUSTER</div>
        <div className="section-heading"><div><p className="eyebrow">科普小测试</p><h2>你对孤独症，<br />了解多少？</h2></div><p className="section-intro">五个常见问题，看看我们是否也曾被误解和刻板印象影响。没有分数，答错也没关系，重要的是理解为什么。</p></div>
        <div className="quiz-progress"><span>已完成 {answeredCount} / {quiz.length}</span><div><i style={{ width: \`\${answeredCount / quiz.length * 100}%\` }} /></div></div>
        <div className="quiz-list">{quiz.map((item, i) => <article className="quiz-item" key={item.question}><div className="quiz-number">Q0{i + 1}</div><div className="quiz-content"><h3>{item.question}</h3><div className="quiz-options">{item.options.map((option, j) => <button key={option} className={answers[i] === j ? (j === item.answer ? "selected correct" : "selected incorrect") : ""} onClick={() => setAnswers((old) => ({ ...old, [i]: j }))} aria-pressed={answers[i] === j}>{option}{answers[i] === j && (j === item.answer ? <Check size={17} /> : <Info size={17} />)}</button>)}</div>{answers[i] !== undefined && <div className={answers[i] === item.answer ? "quiz-feedback good" : "quiz-feedback"}><strong>{answers[i] === item.answer ? "理解正确" : "再认识一点"}</strong><p>{item.explanation}</p></div>}</div></article>)}</div>
        {answeredCount === quiz.length && <div className="quiz-finish"><span>THANK YOU FOR LEARNING</span><h3>测试完成。<br />认知更新，是理解的开始。</h3><p>孤独症不是性格孤僻，也不是家庭教育失误，而是一种神经发育差异。每个孩子都值得被看见、被尊重，并获得适合自己的支持。</p><button onClick={() => setAnswers({})}>重新阅读问题 <ArrowRight size={16} /></button></div>}
      </section>

      <section className="action-section" id="action">
        <div className="section-kicker">05 / TAKE ACTION</div>
        <p className="eyebrow">A LITTLE MORE UNDERSTANDING</p>
        <h2>让理解，<br /><em>成为一种日常。</em></h2>
        <p className="action-lead">他们只是看待世界的方式与我们不同。<br />不猎奇，不神化，不指责。多一点耐心、等待与尊重。</p>
        <div className="action-grid">
          <article><span>01</span><HeartHandshake size={22} /><h3>更新认知</h3><p>主动传播可靠的孤独症科普，拒绝转发“天才星星孩子”等猎奇内容。</p></article>
          <article><span>02</span><Info size={22} /><h3>善意地等待</h3><p>在公共场所遇到孩子情绪激动或出现重复行为时，不围观、不指责，给孩子和家长留出空间。</p></article>
          <article><span>03</span><HeartHandshake size={22} /><h3>理解照护者</h3><p>关注家庭的长期压力。喘息服务、家长互助与社区支持，帮助的不只是孩子，也是整个家庭。</p></article>
          <article><span>04</span><AudioLines size={22} /><h3>参与志愿服务</h3><p>关注本地残联、儿童康复机构的志愿者招募，参与前先接受基础科普与服务培训。</p></article>
        </div>
        <div className="resource-panel"><div><p className="eyebrow">RESOURCE GUIDE</p><h3>需要帮助时，<br />可以从哪里开始？</h3></div><div className="resource-links"><a href="https://www.nhc.gov.cn/wjw/c100376/202209/6a80e32ecd4a41a1907966e70a080688.shtml" target="_blank" rel="noreferrer"><span>01</span><div><strong>国家卫生健康委筛查干预服务规范</strong><small>了解儿童筛查、诊断与干预服务路径 ↗</small></div></a><a href="https://www.cdpf.org.cn/" target="_blank" rel="noreferrer"><span>02</span><div><strong>中国残疾人联合会</strong><small>查询地方残疾儿童康复救助政策与服务机构 ↗</small></div></a><a href="https://www.nhc.gov.cn/" target="_blank" rel="noreferrer"><span>03</span><div><strong>地方儿童医院 / 妇幼保健院</strong><small>可咨询儿童保健、发育行为或儿童精神心理相关门诊 ↗</small></div></a></div></div>
      </section>

      <footer className="site-footer"><a className="brand" href="#home"><span className="brand-star">✳</span><span>星星的孩子<small>UNDER THE SAME SKY</small></span></a><p>不一样的感知方式，同样值得被理解。</p><div className="footer-bottom"><span>科普资料来源：国家卫生健康委公开资料、家长口述素材（澎湃新闻原文待核验）、地方公开案例（待补充出处）。</span><span>本网站仅作科普指引，不提供医疗诊断。</span></div></footer>
    </main>
  );
}
