package skill;

/// 这是一个[Skill][shared.Skills]：如何游走[知识存储结构][shared.知识存储结构]——
/// 一张由[MD注释链接构成的图][shared.Java的MD格式注释用于持久化笔记]。
/// [共生循环][shared.共生循环]要求LLM应答前**自主**游走到信息足够为止，本Skill即该游走动作的方法。
///
/// 优先用IntelliJ IDEA系列tools（jetbrains-index）游走：代码导航默认必须走它们，**禁用**Glob / grep替代
///
/// 双向游走：一条链接要能正、反两向走通，才算真的连通
/// - 正向（顺着链接跳到目标节点）：`ide_find_definition`
/// - 正向读文档（等价IDE悬浮Quick Documentation）：`get_symbol_info`，直接读回目标声明、签名、类型与doc
/// - 反向（找谁链接了本节点——验证双向性、并发现未走到的新节点）：`ide_find_references`
///
/// 中文符号需用位置跳转：`ide_find_definition`的`language + symbol`形式只认ASCII标识符，
/// 本图节点名全是中文，该形式一律报格式错误；
/// 改用`file + line + column`位置形式（必要时先用`ide_find_class`定位类声明的行列）
///
/// 注释链接进符号索引，正反向都能走：
/// - 链接与目录包（形如[共识][./shared]）对`ide_find_definition` / `get_symbol_info`正向可达；
///   走到package时`get_symbol_info`返回其`package-info`
/// - 反向对目录链接同样有效：先定位到目标的`package x;`声明，再`ide_find_references`
/// - 落点须落在名字字符上：`pkg.Class`指`Class`段，`./dir`指`dir`段，落在`.`上返回空
///
/// 文本兜底仅在目标无源码时用：空的/非Java的包，
/// 放不了符号锚点，`ide_find_definition` / `ide_find_references`都走不到，需`ide_search_text`或文件工具兜底
///
/// 悬空节点：无注释即无信息载体，无出入边则游走时既走不到也走不出；
/// 发现后应及时补链或清理（本节点自身即由悬空补链而来）
public class 知识图谱游走 {}
