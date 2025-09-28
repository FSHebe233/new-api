
/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState, useContext, useRef } from 'react';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
  renderGroupOption,
  renderQuotaWithPrompt,
  getModelCategories,
  selectFilter,
  getQuotaWithUnit,
  renderUnitWithQuota,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Avatar,
  Form,
  Col,
  Row,
  InputNumber,
} from '@douyinfe/semi-ui';
import {
  IconCreditCard,
  IconLink,
  IconSave,
  IconClose,
  IconKey,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../../context/Status';

const { Text, Title } = Typography;

const EditTokenModal = (props) => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);
  const [models, setModels] = useState([]);
  const [groups, setGroups] = useState([]);
  const isEdit = props.editingToken.id !== undefined;
  const [useAmount, setUseAmount] = useState(false);
  const [amountValue, setAmountValue] = useState(0);
  const [useDailyAmount, setUseDailyAmount] = useState(false);
  const [dailyAmountValue, setDailyAmountValue] = useState(0);

  const getInitValues = () => ({
    name: '',
    remain_quota: 500000,
    expired_time: -1,
    unlimited_quota: false,
    model_limits_enabled: false,
    model_limits: [],
    allow_ips: '',
    group: '',
    tokenCount: 1,
    start_on_first_use: false,
    duration_days: 0,
    duration_hours: 0,
    daily_quota_limit: 0,
    first_used_time: 0,
    extend_days: 0,
    extend_hours: 0,
  });

  const handleCancel = () => {
    props.handleClose();
  };

  const setExpiredTime = (month, day, hour, minute) => {
    const now = new Date();
    let ts = Math.floor(now.getTime() / 1000);
    let seconds = month * 30 * 24 * 60 * 60 + day * 24 * 60 * 60 + hour * 60 * 60 + minute * 60;
    if (!formApiRef.current) return;
    if (seconds !== 0) {
      ts += seconds;
      formApiRef.current.setValue('expired_time', timestamp2string(ts));
    } else {
      formApiRef.current.setValue('expired_time', -1);
    }
  };

  const loadModels = async () => {
    const res = await API.get(`/api/user/models`);
    const { success, message, data } = res.data;
    if (!success) return showError(t(message));
    const categories = getModelCategories(t);
    const list = data.map((m) => {
      let icon = null;
      for (const [key, cat] of Object.entries(categories)) {
        if (key !== 'all' && cat.filter({ model_name: m })) {
          icon = cat.icon;
          break;
        }
      }
      return { label: (<span className='flex items-center gap-1'>{icon}{m}</span>), value: m };
    });
    setModels(list);
  };

  const loadGroups = async () => {
    const res = await API.get(`/api/user/self/groups`);
    const { success, message, data } = res.data;
    if (!success) return showError(t(message));
    let opts = Object.entries(data).map(([group, info]) => ({
      label: info.desc,
      value: group,
      ratio: info.ratio,
    }));
    if (statusState?.status?.default_use_auto_group) {
      if (opts.some((g) => g.value === 'auto')) {
        opts.sort((a, b) => (a.value === 'auto' ? -1 : 1));
      } else {
        opts.unshift({ label: t('自动选择'), value: 'auto' });
      }
    }
    setGroups(opts);
    if (statusState?.status?.default_use_auto_group && formApiRef.current) {
      formApiRef.current.setValue('group', 'auto');
    }
  };

  const loadToken = async () => {
    setLoading(true);
    const res = await API.get(`/api/token/${props.editingToken.id}`);
    const { success, message, data } = res.data;
    if (!success) {
      showError(message);
      setLoading(false);
      return;
    }
    const v = { ...getInitValues(), ...data };
    if (v.expired_time !== -1) v.expired_time = timestamp2string(v.expired_time);
    v.model_limits = v.model_limits ? (v.model_limits === '' ? [] : v.model_limits.split(',')) : [];
    if (typeof v.duration_seconds === 'number' && v.duration_seconds > 0) {
      v.duration_days = Math.floor(v.duration_seconds / 86400);
      v.duration_hours = Math.floor((v.duration_seconds % 86400) / 3600);
    }
    if (typeof v.daily_quota_limit !== 'number') v.daily_quota_limit = 0;
    if (formApiRef.current) formApiRef.current.setValues(v);
    setLoading(false);
  };

  useEffect(() => {
    if (formApiRef.current && !isEdit) formApiRef.current.setValues(getInitValues());
    loadModels();
    loadGroups();
  }, [props.editingToken.id]);

  useEffect(() => {
    if (props.visiable) {
      if (isEdit) loadToken(); else formApiRef.current?.setValues(getInitValues());
    } else {
      formApiRef.current?.reset();
    }
  }, [props.visiable, props.editingToken.id]);

  const generateRandomSuffix = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    for (let i = 0; i < 6; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
  };

  const submit = async (values) => {
    setLoading(true);
    if (isEdit) {
      let { tokenCount: _tc, ...local } = values;
      local.remain_quota = parseInt(local.remain_quota || 0);
      // 相对延长：天/小时 -> 秒
      const extendSeconds = ((parseInt(local.extend_days || 0) * 24) + parseInt(local.extend_hours || 0)) * 3600;
      delete local.extend_days;
      delete local.extend_hours;
      // 持续时长：天/小时 -> 秒
      local.duration_seconds = ((parseInt(local.duration_days || 0) * 24) + parseInt(local.duration_hours || 0)) * 3600;
      delete local.duration_days;
      delete local.duration_hours;
      local.daily_quota_limit = parseInt(local.daily_quota_limit || 0);
      if (local.start_on_first_use) {
        const fus = parseInt(local.first_used_time || 0);
        if (!fus || fus <= 0) {
          const hasValidExpired = !!local.expired_time && local.expired_time !== -1;
          if (!hasValidExpired) {
            local.expired_time = -1; // 未使用：后端首用再计算过期
          }
        }
      }
      if (local.expired_time !== -1) {
        const time = Date.parse(local.expired_time);
        if (isNaN(time)) {
          showError(t('过期时间格式错误！'));
          setLoading(false);
          return;
        }
        local.expired_time = Math.ceil(time / 1000);
      }
      // 应用“增加时长”
      if (extendSeconds > 0) {
        const fus = parseInt(local.first_used_time || 0);
        if (local.start_on_first_use && (!fus || fus <= 0)) {
          local.duration_seconds = (local.duration_seconds || 0) + extendSeconds;
        } else {
          if (local.expired_time !== -1) local.expired_time = (parseInt(local.expired_time || 0) || 0) + extendSeconds;
        }
      }
      local.model_limits = (local.model_limits || []).join(',');
      local.model_limits_enabled = (local.model_limits || '') !== '';
      const res = await API.put(`/api/token/`, { ...local, id: parseInt(props.editingToken.id) });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('令牌更新成功！'));
        props.refresh();
        props.handleClose();
      } else {
        showError(t(message));
      }
    } else {
      const count = parseInt(values.tokenCount, 10) || 1;
      let successCount = 0;
      for (let i = 0; i < count; i++) {
        let { tokenCount: _tc, ...local } = values;
        const base = values.name.trim() === '' ? 'default' : values.name.trim();
        local.name = i === 0 && values.name.trim() !== '' ? base : `${base}-${generateRandomSuffix()}`;
        local.remain_quota = parseInt(local.remain_quota || 0);
        const extendSeconds = ((parseInt(local.extend_days || 0) * 24) + parseInt(local.extend_hours || 0)) * 3600;
        delete local.extend_days;
        delete local.extend_hours;
        local.duration_seconds = ((parseInt(local.duration_days || 0) * 24) + parseInt(local.duration_hours || 0)) * 3600;
        delete local.duration_days;
        delete local.duration_hours;
        local.daily_quota_limit = parseInt(local.daily_quota_limit || 0);
        if (local.start_on_first_use) {
          const hasValidExpired = !!local.expired_time && local.expired_time !== -1;
          if (!hasValidExpired) {
            local.expired_time = -1;
          }
        }
        if (local.expired_time !== -1) {
          const time = Date.parse(local.expired_time);
          if (isNaN(time)) {
            showError(t('过期时间格式错误！'));
            setLoading(false);
            break;
          }
          local.expired_time = Math.ceil(time / 1000);
        }
        if (extendSeconds > 0) {
          if (local.start_on_first_use) {
            local.duration_seconds = (local.duration_seconds || 0) + extendSeconds;
          } else if (local.expired_time !== -1) {
            local.expired_time = (parseInt(local.expired_time || 0) || 0) + extendSeconds;
          }
        }
        local.model_limits = (local.model_limits || []).join(',');
        local.model_limits_enabled = (local.model_limits || '') !== '';
        const res = await API.post(`/api/token/`, local);
        const { success, message } = res.data;
        if (!success) {
          showError(t(message));
          break;
        }
        successCount++;
      }
      if (successCount > 0) {
        showSuccess(t('令牌创建成功，请在列表页面点击复制获取令牌！'));
        props.refresh();
        props.handleClose();
      }
    }
    setLoading(false);
    formApiRef.current?.setValues(getInitValues());
  };

  return (
    <SideSheet
      placement={isEdit ? 'right' : 'left'}
      title={
        <Space>
          {isEdit ? (
            <Tag color='blue' shape='circle'>{t('更新')}</Tag>
          ) : (
            <Tag color='green' shape='circle'>{t('新建')}</Tag>
          )}
          <Title heading={4} className='m-0'>
            {isEdit ? t('更新令牌信息') : t('创建新的令牌')}
          </Title>
        </Space>
      }
      bodyStyle={{ padding: '0' }}
      visible={props.visiable}
      width={isMobile ? '100%' : 600}
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button theme='solid' className='!rounded-lg' onClick={() => formApiRef.current?.submitForm()} icon={<IconSave />} loading={loading}>
              {t('提交')}
            </Button>
            <Button theme='light' className='!rounded-lg' type='primary' onClick={handleCancel} icon={<IconClose />}>
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
      closeIcon={null}
      onCancel={() => handleCancel()}
    >
      <Spin spinning={loading}>
        <Form key={isEdit ? 'edit' : 'new'} initValues={getInitValues()} getFormApi={(api) => (formApiRef.current = api)} onSubmit={submit}>
          {({ values }) => {
            const hideExpiration = values.start_on_first_use && (!values.first_used_time || values.first_used_time === 0);
            const getPlanDurationText = () => {
              const d = parseInt(values.duration_days || 0) || 0;
              const h = parseInt(values.duration_hours || 0) || 0;
              if (!d && !h) return t('未设置');
              return `${d}${t('天')}${h ? ` ${h}${t('小时')}` : ''}`;
            };
            const getRemainText = () => {
              if (!values || !values.expired_time || values.expired_time === -1 || hideExpiration) return '';
              const ms = Date.parse(values.expired_time) - Date.now();
              if (isNaN(ms)) return '';
              const sec = Math.max(0, Math.floor(ms / 1000));
              const days = Math.floor(sec / 86400);
              const hours = Math.floor((sec % 86400) / 3600);
              return `${days}${t('天')} ${hours}${t('小时')}`;
            };
            return (
              <div className='p-2'>
                {/* 基本信息 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar size='small' color='blue' className='mr-2 shadow-md'>
                      <IconKey size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>{t('基本信息')}</Text>
                      <div className='text-xs text-gray-600'>{t('设置令牌的基本信息')}</div>
                    </div>
                  </div>
                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Input field='name' label={t('名称')} placeholder={t('请输入名称')} rules={[{ required: true, message: t('请输入名称') }]} showClear />
                    </Col>
                    <Col span={24}>
                      {groups.length > 0 ? (
                        <Form.Select field='group' label={t('令牌分组')} placeholder={t('令牌分组，默认为用户的分组')} optionList={groups} renderOptionItem={renderGroupOption} showClear style={{ width: '100%' }} />
                      ) : (
                        <Form.Select placeholder={t('管理员未设置用户可选分组')} disabled label={t('令牌分组')} style={{ width: '100%' }} />
                      )}
                    </Col>

                    {!hideExpiration && (
                      <>
                        <Col xs={24} sm={24} md={24} lg={10} xl={10}>
                          <Form.DatePicker
                            field='expired_time'
                            label={t('过期时间')}
                            type='dateTime'
                            placeholder={t('请选择过期时间')}
                            rules={[
                              { required: true, message: t('请选择过期时间') },
                              {
                                validator: (rule, value) => {
                                  if (value === -1 || !value) return Promise.resolve();
                                  const time = Date.parse(value);
                                  if (isNaN(time)) return Promise.reject(t('过期时间格式错误！'));
                                  if (time <= Date.now()) return Promise.reject(t('过期时间不能早于当前时间！'));
                                  return Promise.resolve();
                                },
                              },
                            ]}
                            showClear
                            style={{ width: '100%' }}
                          />
                        </Col>
                        <Col xs={24} sm={24} md={24} lg={14} xl={14}>
                          <Form.Slot label={t('过期时间快捷设置')}>
                            <Space wrap>
                              <Button theme='light' type='primary' onClick={() => setExpiredTime(0, 0, 0, 0)}>{t('永不过期')}</Button>
                              <Button theme='light' type='tertiary' onClick={() => setExpiredTime(1, 0, 0, 0)}>{t('一个月')}</Button>
                              <Button theme='light' type='tertiary' onClick={() => setExpiredTime(0, 1, 0, 0)}>{t('一天')}</Button>
                              <Button theme='light' type='tertiary' onClick={() => setExpiredTime(0, 0, 1, 0)}>{t('一小时')}</Button>
                            </Space>
                          </Form.Slot>
                        </Col>
                      </>
                    )}
                    {hideExpiration && (
                      <>
                        <Col span={24}>
                          <Form.Slot label={t('过期时间')}>
                            <span>{t('未启用')}</span>
                          </Form.Slot>
                        </Col>
                        <Col span={24}>
                          <Form.Slot label={t('计划持续时长')}>
                            <span>{getPlanDurationText()}</span>
                          </Form.Slot>
                        </Col>
                      </>
                    )}

                    {/* 用后计时/持续时间/每日限额/金额输入 */}
                    <Col span={24}>
                      <Form.Switch
                        field='start_on_first_use'
                        label={t('首用后开始计时')}
                        size='large'
                        extraText={t('开启后将在首次请求时开始计时，可设置可用天数/小时，过期时间自动计算')}
                      />
                    </Col>
                    {(values.start_on_first_use || (parseInt(values.daily_quota_limit || 0) > 0)) && (
                      <>
                        <Col xs={12} sm={12}>
                          <Form.InputNumber field='duration_days' label={t('可用天数')} min={0} style={{ width: '100%' }} />
                        </Col>
                        <Col xs={12} sm={12}>
                          <Form.InputNumber field='duration_hours' label={t('额外小时数')} min={0} style={{ width: '100%' }} />
                        </Col>
                        <Col xs={12} sm={12}>
                          {useDailyAmount ? (
                            <Form.Slot label={t('每日金额上限')}>
                              <InputNumber
                                value={dailyAmountValue}
                                onChange={(v) => {
                                  const val = parseFloat(v) || 0;
                                  setDailyAmountValue(val);
                                  const q = renderUnitWithQuota(val);
                                  formApiRef.current?.setValue('daily_quota_limit', parseInt(q) || 0);
                                }}
                                placeholder={t('请输入金额')}
                                style={{ width: '100%' }}
                              />
                            </Form.Slot>
                          ) : (
                            <Form.InputNumber
                              field='daily_quota_limit'
                              label={t('每日额度上限')}
                              min={0}
                              style={{ width: '100%' }}
                            />
                          )}
                        </Col>
                        <Col xs={12} sm={12}>
                          <Form.Slot label={t('按金额输入')}>
                            <div className='flex items-center gap-3'>
                              <Button
                                type={useDailyAmount ? 'primary' : 'tertiary'}
                                onClick={() => {
                                  try {
                                    const q = parseInt(formApiRef.current?.getValue('daily_quota_limit') || 0);
                                    const amt = parseFloat(getQuotaWithUnit(q));
                                    if (Number.isFinite(amt)) setDailyAmountValue(amt);
                                  } catch (_) {}
                                  setUseDailyAmount(!useDailyAmount);
                                }}
                                size='small'
                              >
                                {useDailyAmount ? t('按额度') : t('按金额')}
                              </Button>
                            </div>
                          </Form.Slot>
                        </Col>
                      </>
                    )}
                    {!hideExpiration && (
                      <Col span={24}>
                        <Form.Slot label={t('剩余时长')}>
                          <span>{getRemainText()}</span>
                        </Form.Slot>
                      </Col>
                    )}

                    {isEdit && (
                      <>
                        <Col xs={12} sm={12}>
                          <Form.InputNumber field='extend_days' label={t('增加天数')} min={0} style={{ width: '100%' }} />
                        </Col>
                        <Col xs={12} sm={12}>
                          <Form.InputNumber field='extend_hours' label={t('增加小时')} min={0} style={{ width: '100%' }} extraText={t('保存时将在当前到期时间或持续时间基础上延长')} />
                        </Col>
                      </>
                    )}
                  </Row>
                </Card>

                {/* 额度设置 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar size='small' color='green' className='mr-2 shadow-md'>
                      <IconCreditCard size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>{t('额度设置')}</Text>
                      <div className='text-xs text-gray-600'>{t('设置令牌可用额度和数值')}</div>
                    </div>
                  </div>
                  <Row gutter={12}>
                    <Col span={12}>
                      {useAmount ? (
                        <Form.Slot label={t('等价金额')}>
                          <InputNumber
                            value={amountValue}
                            disabled={values.unlimited_quota}
                            onChange={(v) => {
                              const val = parseFloat(v) || 0;
                              setAmountValue(val);
                              const q = renderUnitWithQuota(val);
                              formApiRef.current?.setValue('remain_quota', parseInt(q) || 0);
                            }}
                            placeholder={t('请输入金额')}
                            style={{ width: '100%' }}
                          />
                        </Form.Slot>
                      ) : (
                        <Form.AutoComplete
                          field='remain_quota'
                          label={t('额度')}
                          placeholder={t('请输入额度')}
                          type='number'
                          disabled={values.unlimited_quota}
                          extraText={renderQuotaWithPrompt(values.remain_quota)}
                          rules={values.unlimited_quota ? [] : [{ required: true, message: t('请输入额度') }]}
                          data={[{ value: 500000, label: '1$' }, { value: 5000000, label: '10$' }, { value: 25000000, label: '50$' }, { value: 50000000, label: '100$' }, { value: 250000000, label: '500$' }, { value: 500000000, label: '1000$' }]}
                          onChange={(v) => {
                            const q = parseInt(v) || 0;
                            try {
                              const amt = parseFloat(getQuotaWithUnit(q));
                              if (Number.isFinite(amt)) setAmountValue(amt);
                            } catch (_) {}
                          }}
                        />
                      )}
                    </Col>
                    <Col span={12}>
                      <Form.Slot label={t('按金额输入')}>
                        <div className='flex items-center gap-3'>
                          <Button
                            type={useAmount ? 'primary' : 'tertiary'}
                            onClick={() => {
                              try {
                                const q = parseInt(formApiRef.current?.getValue('remain_quota') || 0);
                                const amt = parseFloat(getQuotaWithUnit(q));
                                if (Number.isFinite(amt)) setAmountValue(amt);
                              } catch (_) {}
                              setUseAmount(!useAmount);
                            }}
                            size='small'
                          >
                            {useAmount ? t('按额度') : t('按金额')}
                          </Button>
                        </div>
                      </Form.Slot>
                    </Col>
                    <Col span={24}>
                      <Form.Switch
                        field='unlimited_quota'
                        label={t('无限额度')}
                        size='large'
                        extraText={t('令牌的额度仅用于限制令牌本身的最大额度使用量，实际的使用受到账户的剩余额度限制')}
                      />
                    </Col>
                  </Row>
                </Card>

                {/* 访问限制 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar size='small' color='purple' className='mr-2 shadow-md'>
                      <IconLink size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>{t('访问限制')}</Text>
                      <div className='text-xs text-gray-600'>{t('设置令牌的访问限制')}</div>
                    </div>
                  </div>
                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Select
                        field='model_limits'
                        label={t('模型限制列表')}
                        placeholder={t('请选择该令牌支持的模型，留空支持所有模型')}
                        multiple
                        optionList={models}
                        extraText={t('非必要，不建议启用模型限制')}
                        filter={selectFilter}
                        autoClearSearchValue={false}
                        searchPosition='dropdown'
                        showClear
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col span={24}>
                      <Form.TextArea
                        field='allow_ips'
                        label={t('IP白名单')}
                        placeholder={t('允许的IP，一行一个，不填写则不限制')}
                        autosize
                        rows={1}
                        extraText={t('请勿过度信任此功能，IP可能被伪造')}
                        showClear
                        style={{ width: '100%' }}
                      />
                    </Col>
                  </Row>
                </Card>
              </div>
            );
          }}
        </Form>
      </Spin>
    </SideSheet>
  );
};

export default EditTokenModal;
